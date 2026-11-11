import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { WorkflowDefinition, WorkflowRunView } from "@console/contracts";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { nextCron, WorkflowService } from "../src/workflows/service.ts";
import { fixture } from "./support/harness-fixture.ts";

async function waitFor(read: () => Promise<WorkflowRunView>, status: string) {
  for (let i = 0; i < 200; i++) {
    const run = await read();
    if (run.status === status) return run;
    if (["failed", "aborted", "faulted"].includes(run.status))
      assert.fail(JSON.stringify(run));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Run did not reach ${status}. ${JSON.stringify(await read())}`);
}
async function projectScope(
  f: Awaited<ReturnType<typeof fixture>>,
  directory: string,
) {
  await mkdir(join(directory, "project"));
  const project = await f.projects.register(
    "Workflow project",
    join(directory, "project"),
  );
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const parent = await harness.root(context);
  await parent.configure(
    { model: { provider: "test", modelId: "test-model" }, tools: [] },
    context,
  );
  return {
    projectId: project.id,
    sessionId,
    conversationId: String(parent.id),
  };
}

test("workflow versions pin execution, gates survive restart, decisions invalidate and admissions deduplicate across target edits", {
  timeout: 20000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-workflows-"));
  let f = await fixture(directory, (faux) =>
    faux.setResponses([fauxAssistantMessage("ready")]),
  );
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const scope = await projectScope(f, directory);
  const id = randomUUID();
  const base = `/v1/projects/${scope.projectId}/workflows/${id}`;
  const definition: WorkflowDefinition = {
    name: "Issue workflow",
    steps: [
      {
        id: "inspect",
        type: "agent",
        instructions: "Inspect {{input.issue}}",
        next: "decision",
      },
      {
        id: "decision",
        type: "condition",
        source: "inspect",
        contains: "ready",
        yes: "approve",
        no: null,
      },
      {
        id: "approve",
        type: "approval",
        message: "Proceed after {{steps.inspect}}?",
        next: "implement",
      },
      {
        id: "implement",
        type: "agent",
        instructions: "Implement {{input.issue}} following {{steps.inspect}}",
        next: null,
      },
    ],
  };
  // Explicit shape keeps strict route schemas exercised.
  const payload = {
    revision: 0,
    definition,
    sessionId: scope.sessionId,
    conversationId: scope.conversationId,
    enabled: false,
  };
  const saved = await f.app.inject({ method: "PUT", url: base, payload });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(
    (await f.app.inject({ method: "PUT", url: base, payload })).statusCode,
    409,
  );
  const requestId = randomUUID();
  const start = () =>
    f.app.inject({
      method: "POST",
      url: `${base}/runs`,
      payload: { requestId, input: { issue: "#42" } },
    });
  const started = await start();
  assert.equal(started.statusCode, 200, started.body);
  const receipt = started.json();
  const runPath = `/v1/projects/${scope.projectId}/workflow-runs/${scope.sessionId}/${receipt.id}`;
  const read = async () => {
    const r = await f.app.inject(runPath);
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as WorkflowRunView;
  };
  let run = await waitFor(read, "approval");
  assert.equal(run.approval?.message, "Proceed after ready?");
  assert.equal(run.outputs.inspect, "ready");
  assert.deepEqual((await start()).json(), receipt);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: base,
        payload: {
          ...payload,
          revision: 1,
          definition: {
            name: "Changed",
            steps: [
              {
                id: "new",
                type: "agent",
                instructions: "different",
                next: null,
              },
            ],
          },
        },
      })
    ).statusCode,
    200,
  );
  assert.equal((await read()).version, 1);
  assert.equal(
    (await f.app.inject(`${base}/versions`)).json().versions.length,
    2,
  );
  const oldRevision = run.approval?.revision;
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([fauxAssistantMessage("implemented")]),
  );
  run = await waitFor(read, "approval");
  assert.equal(run.approval?.revision, oldRevision);
  const invalidated = await f.app.inject({
    method: "POST",
    url: `${runPath}/invalidate`,
    payload: { revision: oldRevision },
  });
  assert.equal(invalidated.statusCode, 200, invalidated.body);
  const newRevision = invalidated.json().approval.revision;
  assert.notEqual(newRevision, oldRevision);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${runPath}/decision`,
        payload: { revision: oldRevision, decision: "approved" },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${runPath}/decision`,
        payload: { revision: newRevision, decision: "approved" },
      })
    ).statusCode,
    200,
  );
  run = await waitFor(read, "completed");
  assert.equal(run.outputs.implement, "implemented");
  assert.equal(run.decisions?.length, 1);
  assert.equal(run.decisions?.[0].actor, "local-owner");
  assert.equal(run.decisions?.[0].decision, "approved");
  assert.deepEqual((await start()).json(), receipt);
  const newConversation = await f.service.addConversation(scope.sessionId);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: base,
        payload: {
          ...payload,
          revision: 2,
          conversationId: String(newConversation.id),
        },
      })
    ).statusCode,
    200,
  );
  assert.deepEqual((await start()).json(), receipt);
  const foreign = await f.service.createStandalone();
  assert.equal(
    (
      await f.app.inject(
        `/v1/projects/${scope.projectId}/workflow-runs/${foreign.sessionId}/${receipt.id}`,
      )
    ).statusCode,
    404,
  );
});

test("signed GitHub triggers reject tampering and deduplicate deliveries after reopening", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-webhook-"));
  const previous = process.env.CONSOLE_GITHUB_WEBHOOK_SECRET;
  process.env.CONSOLE_GITHUB_WEBHOOK_SECRET = "test-webhook-secret";
  let f = await fixture(directory, (faux) =>
    faux.setResponses([fauxAssistantMessage("triaged")]),
  );
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
    if (previous === undefined)
      delete process.env.CONSOLE_GITHUB_WEBHOOK_SECRET;
    else process.env.CONSOLE_GITHUB_WEBHOOK_SECRET = previous;
  });
  const scope = await projectScope(f, directory);
  const service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  await service.save(
    scope.projectId,
    id,
    0,
    {
      name: "GitHub issues",
      steps: [
        {
          id: "triage",
          type: "agent",
          instructions: "Read issue {{input.number}} {{input.title}}",
          next: null,
        },
      ],
      trigger: {
        type: "github",
        repository: "owner/repo",
        event: "issues",
        action: "opened",
      },
    },
    scope.sessionId,
    scope.conversationId,
    true,
  );
  const body = JSON.stringify({
    repository: { full_name: "owner/repo" },
    action: "opened",
    issue: { number: 42, title: "Unicode ✓" },
  });
  const signature = `sha256=${createHmac("sha256", "test-webhook-secret").update(body).digest("hex")}`;
  const headers = {
    "content-type": "application/json",
    "x-github-delivery": randomUUID(),
    "x-github-event": "issues",
    "x-hub-signature-256": signature,
  };
  const url = `/v1/hooks/github/${scope.projectId}`;
  assert.equal(
    (await f.app.inject({ method: "POST", url, headers, payload: `${body} ` }))
      .statusCode,
    401,
  );
  const result = await f.app.inject({
    method: "POST",
    url,
    headers,
    payload: body,
  });
  assert.equal(result.statusCode, 200, result.body);
  const receipt = result.json().runs[0];
  assert.deepEqual(
    (await f.app.inject({ method: "POST", url, headers, payload: body })).json()
      .runs[0],
    receipt,
  );
  await waitFor(
    () => service.run(scope.projectId, scope.sessionId, receipt.id),
    "completed",
  );
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual(
    (await f.app.inject({ method: "POST", url, headers, payload: body })).json()
      .runs[0],
    receipt,
  );
});

test("cron respects timezone and skips missed intervals without overlapping a waiting workflow", {
  timeout: 10000,
}, async (t) => {
  assert.equal(
    new Date(
      nextCron("0 9 * * *", "Asia/Kolkata", Date.parse("2026-11-11T00:00:00Z")),
    ).toISOString(),
    "2026-11-11T03:30:00.000Z",
  );
  assert.throws(() => nextCron("* * * * * *", "UTC", Date.now()));
  assert.throws(() => nextCron("* * * * *", "unknown", Date.now()));
  const directory = await mkdtemp(join(tmpdir(), "console-cron-"));
  const f = await fixture(directory);
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const scope = await projectScope(f, directory);
  const service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  await service.save(
    scope.projectId,
    id,
    0,
    {
      name: "Scheduled gate",
      steps: [
        {
          id: "gate",
          type: "approval",
          message: "Scheduled {{input.scheduledAt}}",
          next: null,
        },
      ],
      trigger: { type: "cron", expression: "* * * * *", timezone: "UTC" },
    },
    scope.sessionId,
    scope.conversationId,
    true,
  );
  f.service.store.db
    .prepare("UPDATE workflows SET nextAt=? WHERE id=?")
    .run(Date.now() - 600000, id);
  await service.tick();
  const runs = await service.runs(scope.projectId);
  assert.equal(runs.length, 1);
  await waitFor(
    () => service.run(scope.projectId, scope.sessionId, runs[0].id),
    "approval",
  );
  f.service.store.db
    .prepare("UPDATE workflows SET nextAt=? WHERE id=?")
    .run(Date.now() - 60000, id);
  await service.tick();
  assert.equal((await service.runs(scope.projectId)).length, 1);
  assert.ok(
    Number(
      f.service.store.db
        .prepare("SELECT nextAt FROM workflows WHERE id=?")
        .get(id)?.nextAt,
    ) > Date.now(),
  );
});

test("merge approvals verify the live SHA, reject changed heads and reconcile a successful merge after restart", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-merge-gate-"));
  const previous = process.env.CONSOLE_GITHUB_TOKEN;
  process.env.CONSOLE_GITHUB_TOKEN = "test-only-github-token";
  let sha = "a".repeat(40);
  let merged = false;
  let merges = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      assert.ok(
        String(url).startsWith(
          "https://api.github.com/repos/owner/repo/pulls/42",
        ),
      );
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-only-github-token",
      );
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.sha, sha);
        merges++;
        merged = true;
        return Response.json({ merged: true });
      }
      return Response.json({
        head: { sha },
        merged,
        state: merged ? "closed" : "open",
      });
    },
  );
  let f = await fixture(directory);
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.CONSOLE_GITHUB_TOKEN;
    else process.env.CONSOLE_GITHUB_TOKEN = previous;
  });
  const scope = await projectScope(f, directory);
  const service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  await service.save(
    scope.projectId,
    id,
    0,
    {
      name: "Approved merge",
      steps: [
        {
          id: "merge",
          type: "approval",
          message: "Merge reviewed SHA {{input.sha}}",
          next: null,
          merge: {
            owner: "owner",
            repository: "repo",
            number: "42",
            sha: "{{input.sha}}",
            method: "squash",
          },
        },
      ],
    },
    scope.sessionId,
    scope.conversationId,
    false,
  );
  const receipt = await service.start(scope.projectId, id, randomUUID(), {
    sha,
  });
  const read = async () => {
    const r = await f.app.inject(
      `/v1/projects/${scope.projectId}/workflow-runs/${scope.sessionId}/${receipt.id}`,
    );
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as WorkflowRunView;
  };
  let run = await waitFor(read, "approval");
  assert.equal(merges, 0);
  const path = `/v1/projects/${scope.projectId}/workflow-runs/${scope.sessionId}/${receipt.id}/decision`;
  sha = "b".repeat(40);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: path,
        payload: { revision: run.approval?.revision, decision: "approved" },
      })
    ).statusCode,
    409,
  );
  assert.equal(merges, 0);
  sha = "a".repeat(40);
  await f.app.close();
  f = await fixture(directory);
  run = await waitFor(read, "approval");
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: path,
        payload: { revision: run.approval?.revision, decision: "approved" },
      })
    ).statusCode,
    200,
  );
  await f.app.close();
  f = await fixture(directory);
  await waitFor(read, "completed");
  assert.equal(merges, 1);
  await f.app.close();
  f = await fixture(directory);
  assert.equal((await read()).status, "completed");
  assert.equal(merges, 1);
});

test("rejected approvals stop downstream work and invalid definitions and cross-project targets fail admission", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-workflow-reject-"));
  const f = await fixture(directory);
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const scope = await projectScope(f, directory);
  const service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  const definition: WorkflowDefinition = {
    name: "Gate",
    steps: [
      { id: "gate", type: "approval", message: "Continue?", next: "run" },
      {
        id: "run",
        type: "agent",
        instructions: "Should never run",
        next: null,
      },
    ],
  };
  await service.save(
    scope.projectId,
    id,
    0,
    definition,
    scope.sessionId,
    scope.conversationId,
    false,
  );
  const receipt = await service.start(scope.projectId, id, randomUUID(), {});
  const read = () => service.run(scope.projectId, scope.sessionId, receipt.id);
  const run = await waitFor(read, "approval");
  await service.decide(
    scope.projectId,
    scope.sessionId,
    receipt.id,
    run.approval?.revision ?? "",
    "rejected",
  );
  // Aborted is the expected terminal receipt here.
  for (let i = 0; i < 100 && (await read()).status !== "aborted"; i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal((await read()).status, "aborted");
  assert.deepEqual((await read()).outputs, {});
  const bad: WorkflowDefinition = {
    name: "Cycle",
    steps: [
      { id: "first", type: "agent", instructions: "loop", next: "first" },
    ],
  };
  await assert.rejects(
    service.save(
      scope.projectId,
      randomUUID(),
      0,
      bad,
      scope.sessionId,
      scope.conversationId,
      false,
    ),
    /point forward/,
  );
  const standalone = await f.service.createStandalone();
  const { harness } = await f.service.session(standalone.sessionId);
  const parent = await harness.root(context);
  await assert.rejects(
    service.save(
      scope.projectId,
      randomUUID(),
      0,
      definition,
      standalone.sessionId,
      String(parent.id),
      false,
    ),
    /in this project/,
  );
});

test("workflow approval routes require owner authentication and record the approving client", {
  timeout: 10000,
}, async (t) => {
  const { AccessService } = await import("../src/access/service.ts");
  const directory = await mkdtemp(join(tmpdir(), "console-workflow-auth-"));
  const access = new AccessService(join(directory, "access.sqlite"));
  const client = access.pair(access.invite().code, "Approver");
  assert.ok(client);
  const f = await fixture(directory, undefined, false, {
    connectionPolicy: {
      origins: ["http://localhost:3001"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      authorize: access.authorize,
    },
    configure: (app) => access.register(app),
  });
  t.after(async () => {
    await f.app.close();
    access.close();
    await rm(directory, { recursive: true, force: true });
  });
  const scope = await projectScope(f, directory);
  const service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  await service.save(
    scope.projectId,
    id,
    0,
    {
      name: "Approval",
      steps: [{ id: "gate", type: "approval", message: "Approve", next: null }],
    },
    scope.sessionId,
    scope.conversationId,
    false,
  );
  const receipt = await service.start(scope.projectId, id, randomUUID(), {});
  const read = () => service.run(scope.projectId, scope.sessionId, receipt.id);
  const run = await waitFor(read, "approval");
  const url = `/v1/projects/${scope.projectId}/workflow-runs/${scope.sessionId}/${receipt.id}/decision`;
  const payload = { revision: run.approval?.revision, decision: "approved" };
  assert.equal(
    (await f.app.inject({ method: "POST", url, payload })).statusCode,
    401,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        headers: { authorization: "Bearer fake" },
        payload,
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${client.token}` },
        payload,
      })
    ).statusCode,
    200,
  );
  const completed = await waitFor(read, "completed");
  assert.equal(completed.decisions?.[0].actor, client.id);
  access.revoke(client.id);
  assert.equal(
    (
      await f.app.inject({
        url: `/v1/projects/${scope.projectId}/workflow-runs`,
        headers: { authorization: `Bearer ${client.token}` },
      })
    ).statusCode,
    401,
  );
});

test("pending admissions recover after the Durable commit and preserve the original captured version", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-workflow-admission-"),
  );
  let f = await fixture(directory);
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const scope = await projectScope(f, directory);
  let service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  const requestId = randomUUID();
  const definition: WorkflowDefinition = {
    name: "Original",
    steps: [
      {
        id: "gate",
        type: "approval",
        message: "Original {{input.value}}",
        next: null,
      },
    ],
  };
  await service.save(
    scope.projectId,
    id,
    0,
    definition,
    scope.sessionId,
    scope.conversationId,
    false,
  );
  const receipt = await service.start(scope.projectId, id, requestId, {
    value: "snapshot",
  });
  await waitFor(
    () => service.run(scope.projectId, scope.sessionId, receipt.id),
    "approval",
  );
  // The process can stop after creating the native task and before saving its index receipt.
  f.service.store.db
    .prepare(
      "UPDATE workflow_admissions SET taskId=NULL WHERE workflowId=? AND requestId=?",
    )
    .run(id, requestId);
  await service.save(
    scope.projectId,
    id,
    1,
    {
      name: "New",
      steps: [{ id: "changed", type: "approval", message: "New", next: null }],
    },
    scope.sessionId,
    scope.conversationId,
    false,
  );
  await f.app.close();
  f = await fixture(directory);
  service = new WorkflowService(f.service, f.projects);
  await service.tick();
  const recovered = await service.start(scope.projectId, id, requestId, {
    value: "different",
  });
  assert.deepEqual(recovered, receipt);
  const runs = await service.runs(scope.projectId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].version, 1);
  assert.equal(runs[0].approval?.message, "Original snapshot");
  const concurrent = await Promise.all([
    service.start(scope.projectId, id, "same-trigger", {}),
    service.start(scope.projectId, id, "same-trigger", {}),
  ]);
  assert.deepEqual(concurrent[0], concurrent[1]);
});

test("a workflow reopens an interrupted owned worker without creating another job or conversation", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-workflow-worker-"));
  let entered!: () => void;
  const running = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let f = await fixture(directory, (faux) =>
    faux.setResponses([
      async (_request, options) => {
        entered();
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) resolve();
          else
            options?.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            });
        });
        return fauxAssistantMessage("", { stopReason: "aborted" });
      },
    ]),
  );
  t.after(async () => {
    await f.app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const scope = await projectScope(f, directory);
  let service = new WorkflowService(f.service, f.projects);
  const id = randomUUID();
  await service.save(
    scope.projectId,
    id,
    0,
    {
      name: "Worker recovery",
      steps: [
        {
          id: "work",
          type: "agent",
          instructions: "Produce a result",
          next: "gate",
        },
        {
          id: "gate",
          type: "approval",
          message: "Review {{steps.work}}",
          next: null,
        },
      ],
    },
    scope.sessionId,
    scope.conversationId,
    false,
  );
  const receipt = await service.start(scope.projectId, id, randomUUID(), {});
  await running;
  let { harness } = await f.service.session(scope.sessionId);
  const before = await harness.commit(
    (tx) => tx.scanTasks({ kind: "console.background-job" }, 100),
    context,
  );
  assert.equal(before.items.length, 1);
  const workerId = before.items[0].id;
  const workerConversations = await harness.commit(
    (tx) => tx.scanConversations({ ownerTaskId: workerId }, 100),
    context,
  );
  assert.equal(workerConversations.items.length, 1);
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([fauxAssistantMessage("Recovered result")]),
  );
  service = new WorkflowService(f.service, f.projects);
  const run = await waitFor(
    () => service.run(scope.projectId, scope.sessionId, receipt.id),
    "approval",
  );
  assert.equal(run.outputs.work, "Recovered result");
  ({ harness } = await f.service.session(scope.sessionId));
  const after = await harness.commit(
    (tx) => tx.scanTasks({ kind: "console.background-job" }, 100),
    context,
  );
  assert.deepEqual(
    after.items.map((task) => task.id),
    [workerId],
  );
  const reopened = await harness.commit(
    (tx) => tx.scanConversations({ ownerTaskId: workerId }, 100),
    context,
  );
  assert.deepEqual(
    reopened.items.map((conversation) => conversation.id),
    workerConversations.items.map((conversation) => conversation.id),
  );
});

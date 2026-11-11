import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { AgentDoc } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

test("discovery advertises actual mutation routes and schemas without owner secrets", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "console-command-catalog-"));
  const f = await fixture(dir);
  t.after(async () => {
    await f.app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const response = await f.app.inject("/v1/commands");
  assert.equal(response.statusCode, 200);
  const catalog = response.json();
  assert.equal(catalog.version, 1);
  assert.equal(catalog.commands.length, 8);
  assert.equal(
    new Set(catalog.commands.map((c: { id: string }) => c.id)).size,
    8,
  );
  assert.equal(response.body.includes("secret-not-in-responses"), false);
  for (const command of catalog.commands) {
    assert.ok(f.app.hasRoute({ method: command.method, url: command.path }));
    assert.equal(command.inputSchema.additionalProperties, false);
    assert.ok(command.scope);
  }
});
test("shared settings need no conversation, reject stale writes and remain compatible with legacy configuration", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "console-scoped-settings-"));
  let f = await fixture(dir);
  t.after(async () => {
    await f.app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const machine = "/v1/machine/workspace-guidance";
  let current = (await f.app.inject(machine)).json();
  const save = (url: string, revision: string, change: object) =>
    f.app.inject({ method: "PATCH", url, payload: { revision, ...change } });
  const changed = await save(machine, current.revision, {
    workspaceGuidance: "Verify claims",
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(f.service.store.list("").length, 0);
  assert.equal(
    (await save(machine, current.revision, { workspaceGuidance: null }))
      .statusCode,
    409,
  );
  assert.equal(
    (await save(machine, changed.json().revision, { tools: [] })).statusCode,
    400,
  );
  await mkdir(join(dir, "project"));
  const project = await f.projects.register("Project", join(dir, "project"));
  const projectPath = `/v1/projects/${project.id}/agent-settings`;
  current = (await f.app.inject(projectPath)).json();
  const savedProject = await save(projectPath, current.revision, {
    projectInstructions: "Project rules",
    projectTools: ["read"],
    inspectionGuidance: "Inspect files",
  });
  assert.equal(savedProject.statusCode, 200, savedProject.body);
  assert.equal(
    (
      await save(
        `/v1/projects/${randomUUID()}/agent-settings`,
        current.revision,
        { projectTools: [] },
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await save(projectPath, savedProject.json().revision, {
        projectTools: ["unknown"],
      })
    ).statusCode,
    400,
  );
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const child = (
    await f.app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionId}/conversations`,
      payload: {},
    })
  ).json();
  const { harness } = await f.service.session(sessionId);
  const agent = await harness.snapshot(AgentDoc, child.id, context);
  assert.deepEqual(agent?.tools, ["read"]);
  const runtime = `/v1/sessions/${sessionId}/runtime-settings`;
  current = (await f.app.inject(runtime)).json();
  const savedRuntime = await save(runtime, current.revision, {
    tokenBudget: 50000,
    automaticCompaction: false,
    runtimePolicy: { toolExecution: "sequential" },
  });
  assert.equal(savedRuntime.statusCode, 200, savedRuntime.body);
  const legacyPath = `/v1/sessions/${sessionId}/conversations/${child.id}/configuration`;
  const legacy = (await f.app.inject(legacyPath)).json();
  assert.equal(legacy.context.tokenBudget, 50000);
  assert.equal(legacy.context.automatic, false);
  assert.deepEqual(legacy.runtimePolicy, { toolExecution: "sequential" });
  assert.equal(legacy.guidance.workspace.text, "Verify claims");
  const legacySaved = await save(legacyPath, legacy.revision, {
    tokenBudget: 60000,
  });
  assert.equal(legacySaved.statusCode, 200, legacySaved.body);
  assert.equal(
    (await save(runtime, savedRuntime.json().revision, { tokenBudget: null }))
      .statusCode,
    409,
  );
  const scopeBefore = (await f.app.inject(runtime)).json();
  const updatedChat = (await f.app.inject(legacyPath)).json();
  await save(legacyPath, updatedChat.revision, {
    instructions: "Local chat change",
  });
  assert.equal(
    (await f.app.inject(runtime)).json().revision,
    scopeBefore.revision,
  );
  await f.app.close();
  f = await fixture(dir);
  assert.equal((await f.app.inject(runtime)).json().values.tokenBudget, 60000);
  assert.equal(
    (
      await save(machine, (await f.app.inject(machine)).json().revision, {
        workspaceGuidance: null,
      })
    ).json().values.workspaceGuidance,
    null,
  );
});
test("session runtime edits enforce idle boundaries but permit budget changes during generation", {
  timeout: 10000,
}, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "console-scoped-busy-"));
  const f = await fixture(dir);
  const release = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>();
  t.after(async () => {
    release.resolve();
    await f.app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  f.faux.setResponses([
    async () => {
      entered.resolve();
      await release.promise;
      return fauxAssistantMessage("Done");
    },
  ]);
  const submission = await root.submit(
    { type: "input", content: "Wait" },
    context,
  );
  await entered.promise;
  const path = `/v1/sessions/${sessionId}/runtime-settings`;
  const current = (await f.app.inject(path)).json();
  for (const change of [
    { runtimePolicy: null },
    { runtimePolicy: { toolExecution: "sequential" }, tokenBudget: 98765 },
    { keepRecentTokens: 2000 },
    { automaticCompaction: false },
  ]) {
    const response = await f.app.inject({
      method: "PATCH",
      url: path,
      payload: { revision: current.revision, ...change },
    });
    assert.equal(response.statusCode, 409, response.body);
  }
  assert.equal(
    (await f.app.inject(path)).json().values.tokenBudget,
    current.values.tokenBudget,
  );
  const budget = await f.app.inject({
    method: "PATCH",
    url: path,
    payload: { revision: current.revision, tokenBudget: 100000 },
  });
  assert.equal(budget.statusCode, 200, budget.body);
  release.resolve();
  await submission.wait(context);
});

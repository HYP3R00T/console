import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { LiveState, TaskId } from "@earendil-works/pi-durable";
import { conversationView, executionView } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

test("session token budget stops later requests, survives reopen and can be raised to continue", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-token-budget-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Budget", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const base = `/v1/sessions/${sessionId}/conversations`;
  const path = `${base}/${root.id}`;
  const setLimit = async (tokenBudget: number | null) => {
    const current = (await f.app.inject(`${path}/configuration`)).json();
    return f.app.inject({
      method: "PATCH",
      url: `${path}/configuration`,
      payload: { revision: current.revision, tokenBudget },
    });
  };
  const saved = await setLimit(1);
  assert.equal(saved.statusCode, 200, saved.body);
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("write", { path: "budget.txt", content: "written once" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Unexpected request past budget."),
  ]);
  const model = { provider: "test", modelId: "test-model" };
  await f.service.submit(
    sessionId,
    String(root.id),
    "Write once",
    randomUUID(),
    { model },
  );
  await harness.waitForIdle(context);
  assert.equal(f.faux.state.callCount, 1);
  const watch = await root.watch(context);
  const failure = conversationView(watch.value).execution.failure;
  await watch.stop();
  assert.equal(failure?.reason, "budget_limit");
  const continueRun = () =>
    f.app.inject({
      method: "POST",
      url: `${path}/continue`,
      payload: { failedTaskId: failure.taskId },
    });
  assert.equal((await continueRun()).statusCode, 409);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/${sibling.id}/messages`,
        payload: { content: "More work", requestId: randomUUID(), model },
      })
    ).statusCode,
    409,
  );
  await f.app.close();
  f = await fixture(directory);
  const settings = (
    await f.app.inject(`${base}/${sibling.id}/configuration`)
  ).json().context;
  assert.equal(settings.tokenBudget, 1);
  assert.ok(settings.sessionTokens > 1);
  assert.equal((await continueRun()).statusCode, 409);
  assert.equal(
    (await setLimit(settings.sessionTokens + 10_000)).statusCode,
    200,
  );
  f.faux.setResponses([fauxAssistantMessage("Finished with a raised budget.")]);
  const continued = await continueRun();
  assert.equal(continued.statusCode, 202, continued.body);
  const reopened = (await f.service.session(sessionId)).harness;
  await reopened.waitForIdle(context);
  assert.equal(f.faux.state.callCount, 1);
  assert.match(
    (await f.app.inject(`${path}/history`)).body,
    /Finished with a raised budget/,
  );
});

test("scheduled reviews persist, run at their deadline and stop independently", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-schedule-review-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Reviews", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const sibling = await f.service.addConversation(sessionId);
  const base = `/v1/sessions/${sessionId}/conversations`;
  const parent = `${base}/${root.id}`;
  const schedule = (at: number, requestId: string) =>
    f.app.inject({
      method: "POST",
      url: `${parent}/reviews`,
      payload: { at, requestId, brief: "Inspect the parser." },
    });
  const future = Date.now() + 3_600_000;
  const requestId = randomUUID();
  const pending = await schedule(future, requestId);
  assert.equal(pending.statusCode, 202, pending.body);
  const id = pending.json().id as TaskId;
  const deadline = Date.now() + 3000;
  while (true) {
    const tasks = (await f.app.inject(`${parent}/tasks`)).json().tasks;
    if (
      tasks.some(
        (task: { id: number; wakeAt?: number }) =>
          task.id === id && task.wakeAt === future,
      )
    )
      break;
    assert.ok(Date.now() < deadline, "Review did not enter its durable sleep");
    await delay(10);
  }
  await root.waitForIdle(context);
  await f.service.stopConversation(sessionId, String(root.id));
  assert.equal(f.faux.state.callCount, 0);
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual((await schedule(future, requestId)).json(), pending.json());
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `${base}/${sibling.id}/reviews/tasks/${id}`,
      })
    ).statusCode,
    404,
  );
  const stopped = await f.app.inject({
    method: "DELETE",
    url: `${parent}/reviews/tasks/${id}`,
  });
  assert.equal(stopped.statusCode, 200, stopped.body);
  const reopened = (await f.service.session(sessionId)).harness;
  assert.equal(
    (await reopened.waitForTask(id, context)).state.outcome.status,
    "aborted",
  );
  assert.equal(f.faux.state.callCount, 0);

  const due = Date.now() + 150;
  f.faux.setResponses([
    (request) => {
      assert.ok(Date.now() >= due);
      assert.ok(
        request.messages.some(
          (message) =>
            message.role === "user" &&
            message.content === "Inspect the parser.",
        ),
      );
      return fauxAssistantMessage("The parser accepts an empty token.");
    },
  ]);
  const scheduled = await schedule(due, randomUUID());
  assert.equal(scheduled.statusCode, 202, scheduled.body);
  assert.equal(
    (await reopened.waitForTask(scheduled.json().id as TaskId, context)).state
      .outcome.status,
    "completed",
  );
  const history = (await f.app.inject(`${parent}/history`)).json().messages;
  assert.deepEqual(
    history.map((message: { activityLabel?: string }) => message.activityLabel),
    ["Background review · cancelled", "Background review · completed"],
  );
  const report = history.at(-1);
  assert.equal(report.text, "The parser accepts an empty token.");
  assert.match(
    (await f.app.inject(`${parent}/reviews/${report.reviewId}`)).body,
    /Inspect the parser/,
  );
  assert.equal(f.faux.state.callCount, 1);
});

test("configured post-run checks are scoped, visible and hold follow-ups until the result is recorded", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-post-run-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Checks", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const base = `/v1/sessions/${sessionId}/conversations`;
  const path = `${base}/${root.id}`;
  const initial = (await f.app.inject(`${path}/configuration`)).json();
  assert.equal(initial.postRunCommand, null);
  const configured = await f.app.inject({
    method: "PATCH",
    url: `${path}/configuration`,
    payload: {
      revision: initial.revision,
      postRunCommand:
        "while [ ! -f release-check ]; do sleep 0.02; done; printf 'assertion failed'; exit 7",
    },
  });
  assert.equal(configured.statusCode, 200, configured.body);
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("write", { path: "example.txt", content: "edited" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("File changed."),
    fauxAssistantMessage("Follow-up answered."),
  ]);
  const first = await f.service.submit(
    sessionId,
    String(root.id),
    "Make the edit",
    randomUUID(),
    {
      model: { provider: "test", modelId: "test-model" },
    },
  );
  const answered = await (await harness.submission(first.id, context))?.wait(
    context,
  );
  assert.equal(answered?.status, "done");
  const deadline = Date.now() + 3000;
  while (true) {
    const response = await f.app.inject(`${path}/tasks`);
    assert.equal(response.statusCode, 200, response.body);
    if (
      response
        .json()
        .tasks.some(
          (task: { kind: string }) => task.kind === "console.post-run-check",
        )
    )
      break;
    assert.ok(Date.now() < deadline, "Post-run check never became active");
    await delay(10);
  }
  assert.deepEqual(
    (await f.app.inject(`${base}/${sibling.id}/tasks`)).json().tasks,
    [],
  );
  const queued = await f.service.submit(
    sessionId,
    String(root.id),
    "Follow up",
    randomUUID(),
  );
  assert.equal(queued.status, "queued");
  assert.equal(f.faux.state.callCount, 2);
  await writeFile(join(directory, "release-check"), "");
  await harness.waitForIdle(context);
  const history = (await f.app.inject(`${path}/history`)).json().messages;
  const outcomes = history.filter(
    (message: { activityLabel?: string }) => message.activityLabel,
  );
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].activityLabel, "Post-run check · failed");
  assert.match(outcomes[0].text, /Exit code 7\.\s+assertion failed/);
  assert.equal(history.at(-1).text, "Follow-up answered.");
  assert.deepEqual((await f.app.inject(`${path}/tasks`)).json().tasks, []);
});

test("reopening an interrupted check reports uncertainty without launching it twice", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-check-reopen-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Checks", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const id = String(root.id);
  const launchLog = join(directory, "launches.txt");
  const config = await f.service.configuration(sessionId, id);
  await f.service.configureConversation(sessionId, id, {
    revision: config.revision,
    postRunCommand: "printf launched >> launches.txt; sleep 60",
  });
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("write", { path: "example.txt", content: "edited" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("File changed."),
  ]);
  await f.service.submit(sessionId, id, "Edit the file", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  const deadline = Date.now() + 3000;
  while (true) {
    try {
      assert.equal(await readFile(launchLog, "utf8"), "launched");
      break;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" ||
        Date.now() >= deadline
      )
        throw error;
      await delay(10);
    }
  }
  await f.app.close();
  f = await fixture(directory);
  const reopened = (await f.service.session(sessionId)).harness;
  await reopened.waitForIdle(context);
  const history = (
    await f.app.inject(`/v1/sessions/${sessionId}/conversations/${id}/history`)
  ).body;
  assert.match(history, /Post-run check · interrupted/);
  assert.equal(await readFile(launchLog, "utf8"), "launched");
});

test("execution projection exposes progress and all run outcomes without provider diagnostics", () => {
  const live = {
    run: { taskId: 1, inputs: [], turns: 0 },
    generation: {
      attempt: 2,
      retry: { at: 1234, error: "private-provider-error" },
    },
    tools: [
      {
        callId: "call",
        name: "read",
        status: "running",
        output: "private-output",
        details: { secret: true },
      },
    ],
    compactions: [
      {
        taskId: 2,
        trigger: "threshold",
        blocking: true,
        attempt: 1,
        retry: { at: 2345, error: "private-compaction-error" },
      },
    ],
    compactionFailure: {
      taskId: 3,
      trigger: "overflow",
      error: "private-compaction-failure",
    },
    runFailure: {
      taskId: 4,
      inputs: [],
      reason: "interrupted",
      detail: "private-run-detail",
    },
  } as unknown as LiveState;
  const projected = executionView(live);
  assert.equal(projected.state, "retrying");
  assert.equal(projected.attempt, 2);
  assert.equal(projected.retryAt, 1234);
  assert.equal(projected.compactions[0].retryAt, 2345);
  assert.deepEqual(projected.tools, [
    { callId: "call", name: "read", status: "running" },
  ]);
  assert.ok(!JSON.stringify(projected).includes("private"));
  delete live.generation?.retry;
  assert.equal(executionView(live).state, "compacting");
  delete live.compactions;
  assert.equal(executionView(live).state, "tools");
  delete live.tools;
  live.generation = { attempt: 2, deferred: { pollAt: 3456 } };
  assert.equal(executionView(live).state, "deferred");
  delete live.generation;
  assert.equal(executionView(live).state, "running");
  delete live.run;
  for (const reason of [
    "model_error",
    "no_model",
    "aborted",
    "reset",
    "faulted",
    "orphaned",
    "interrupted",
    "restart_limit",
    "nothing_to_answer",
    "turn_limit",
  ] as const) {
    live.runFailure = { taskId: 4 as never, inputs: [], reason };
    assert.equal(executionView(live).failure?.reason, reason);
    assert.equal(executionView(live).state, "idle");
  }
});

test("entry-bound history pages bridge sliding windows without mixing siblings or invisible entries", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-history-boundaries-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("History", directory);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  const ids: number[] = [];
  for (let index = 0; index < 125; index++) {
    await root.submit(
      {
        type: "write",
        entry: {
          kind: "console.test",
          data: { index },
          ...(index % 3
            ? {
                model: [
                  {
                    role: "user",
                    content: `History ${index}`,
                    timestamp: index,
                  },
                ],
              }
            : {}),
        },
      },
      context,
    );
    await sibling.submit(
      { type: "write", entry: { kind: "console.test", data: { index } } },
      context,
    );
  }
  const all = await root.entries(
    { order: "ascending" },
    200,
    undefined,
    context,
  );
  ids.push(...all.items.map((entry) => entry.id));
  const watch = await root.watch(context);
  const snapshot = conversationView(watch.value);
  assert.deepEqual(snapshot.history.ids, ids.slice(-50));
  assert.equal(snapshot.history.before, ids.at(-51));
  await watch.stop();
  const base = `/v1/sessions/${session.sessionId}/conversations/${root.id}/history`;
  const page = (await f.app.inject(`${base}?before=${ids[75]}`)).json();
  assert.deepEqual(page.history.ids, ids.slice(25, 75));
  assert.equal(page.history.before, ids[24]);
  assert.ok(
    page.messages.every((message: { entryId: number }) =>
      page.history.ids.includes(message.entryId),
    ),
  );
  const first = (await f.app.inject(`${base}?before=${ids[25]}`)).json();
  assert.deepEqual(first.history.ids, ids.slice(0, 25));
  assert.equal(first.history.before, undefined);
  const legacy = (await f.app.inject(base)).json();
  assert.equal(legacy.history.ids.length, 50);
  assert.ok(legacy.next);
  assert.equal(
    (await f.app.inject(`${base}?cursor=${legacy.next}`)).statusCode,
    200,
  );
  assert.equal((await f.app.inject(`${base}?before=0`)).statusCode, 400);
  assert.equal(
    (await f.app.inject(`${base}?before=${ids[75]}&cursor=${legacy.next}`))
      .statusCode,
    400,
  );
});

test("a persisted turn limit can be continued once without appending a user message", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-execution-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const session = await f.service.createStandalone();
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  const base = `/v1/sessions/${session.sessionId}/conversations/${root.id}`;
  const initial = (await f.app.inject(`${base}/configuration`)).json();
  assert.equal(initial.context.maxTurns, null);
  assert.equal(initial.context.usage, null);
  const patch = await f.app.inject({
    method: "PATCH",
    url: `${base}/configuration`,
    payload: { revision: initial.revision, maxTurns: 1 },
  });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(patch.json().context.maxTurns, 1);
  f.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("bash", { command: "printf test" }), {
      stopReason: "toolUse",
    }),
  ]);
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "Run once",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await harness.waitForIdle(context);
  let watch = await root.watch(context);
  assert.equal(conversationView(watch.value).busy, false);
  assert.equal(
    conversationView(watch.value).execution.failure?.reason,
    "turn_limit",
  );
  await watch.stop();
  assert.equal(
    (await f.app.inject(`${base}/submissions`)).json().latest.reason,
    "turn_limit",
  );
  await f.app.close();
  f = await fixture(directory);
  const reopened = (await f.service.session(session.sessionId)).harness;
  watch = await (await reopened.root(context)).watch(context);
  const failure = conversationView(watch.value).execution.failure;
  assert.equal(failure?.reason, "turn_limit");
  assert.equal(failure.canContinue, true);
  await watch.stop();
  f.faux.setResponses([fauxAssistantMessage("Finished after Continue.")]);
  const resume = (failedTaskId: number) =>
    f.app.inject({
      method: "POST",
      url: `${base}/continue`,
      payload: { failedTaskId },
    });
  assert.equal((await resume(failure.taskId + 1)).statusCode, 409);
  const continued = await resume(failure.taskId);
  assert.equal(continued.statusCode, 202, continued.body);
  await reopened.waitForIdle(context);
  const retry = await resume(failure.taskId);
  assert.equal(retry.statusCode, 202, retry.body);
  assert.deepEqual(retry.json(), continued.json());
  const latest = (await f.app.inject(`${base}/submissions`)).json().latest;
  assert.equal(latest.id, continued.json().id);
  assert.equal(latest.type, "continue");
  assert.equal(latest.status, "done");
  const history = (await f.app.inject(`${base}/history`)).json();
  assert.equal(
    history.messages.filter(
      (message: { role: string }) => message.role === "user",
    ).length,
    1,
  );
  const config = (await f.app.inject(`${base}/configuration`)).json();
  assert.ok(config.context.estimatedContextTokens > 0);
  assert.ok(config.context.usage.tokens > 0);
});

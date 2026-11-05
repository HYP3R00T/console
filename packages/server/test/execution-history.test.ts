import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { LiveState } from "@earendil-works/pi-durable";
import { conversationView, executionView } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

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

test("a real limited run stays visibly failed after reopening, without leaking diagnostics", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-execution-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const session = await f.service.createStandalone();
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  await root.configure({ maxTurns: 1 }, context);
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
  const base = `/v1/sessions/${session.sessionId}/conversations/${root.id}/submissions`;
  assert.equal((await f.app.inject(base)).json().latest.reason, "turn_limit");
  await f.app.close();
  f = await fixture(directory);
  const reopened = (await f.service.session(session.sessionId)).harness;
  watch = await (await reopened.root(context)).watch(context);
  assert.equal(
    conversationView(watch.value).execution.failure?.reason,
    "turn_limit",
  );
  await watch.stop();
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { CompactionEntry } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

test("per-model compaction overrides take effect on a reopened runtime", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-model-compaction-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  let root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const model = f.providers.models.getModel("test", "test-model");
  assert.ok(model);
  const path = `/v1/sessions/${sessionId}/conversations/${root.id}/configuration`;
  const initial = (await f.app.inject(path)).json();
  const saved = await f.app.inject({
    method: "PATCH",
    url: path,
    payload: {
      revision: initial.revision,
      automaticCompaction: false,
      runtimePolicy: {
        compaction: {
          modelOverrides: {
            "test/test-model": {
              enabled: true,
              reserveTokens: model.contextWindow - 2000,
              keepRecentTokens: 400,
              backgroundTokens: 0,
            },
          },
        },
      },
    },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  for (let index = 0; index < 8; index++) {
    await (
      await root.submit(
        {
          type: "write",
          entry: {
            kind: "test.context",
            model: [
              {
                role: "user",
                content: `Detail ${index}: ${"history ".repeat(800)}`,
                timestamp: Date.now(),
              },
            ],
          },
        },
        context,
      )
    ).wait(context);
  }
  await f.app.close();
  f = await fixture(directory);
  ({ harness } = await f.service.session(sessionId));
  root = await harness.root(context);
  f.faux.setResponses([
    fauxAssistantMessage("## Goal\nRetain the details."),
    fauxAssistantMessage("Finished."),
  ]);
  const answer = await (
    await root.submit(
      { type: "input", content: "Summarize the outcome." },
      context,
    )
  ).wait(context);
  assert.equal(answer.status, "done");
  const history = await root.entries({}, 100, undefined, context);
  assert.ok(history.items.some((entry) => CompactionEntry.is(entry)));
  assert.equal(f.faux.state.callCount, 2);
});

test("runtime policy validates, shares a session revision and survives reopening", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-runtime-policy-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  const path = `/v1/sessions/${sessionId}/conversations/${root.id}/configuration`;
  const siblingPath = `/v1/sessions/${sessionId}/conversations/${sibling.id}/configuration`;
  const initial = (await f.app.inject(path)).json();
  const oldSibling = (await f.app.inject(siblingPath)).json();
  const policy = {
    toolExecution: "sequential",
    afterFailedRun: "withdraw",
    retry: { maxRetries: 0 },
    compaction: {
      reserveTokens: 8000,
      backgroundTokens: 4000,
      modelOverrides: {
        "test/test-model": { keepRecentTokens: 2000, reserveTokens: 4000 },
      },
    },
    progress: { persistWithinMs: 0 },
  };
  const changed = await f.app.inject({
    method: "PATCH",
    url: path,
    payload: { revision: initial.revision, runtimePolicy: policy },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.deepEqual(changed.json().runtimePolicy, policy);
  assert.deepEqual(
    (await f.app.inject(siblingPath)).json().runtimePolicy,
    policy,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PATCH",
        url: siblingPath,
        payload: { revision: oldSibling.revision, runtimePolicy: null },
      })
    ).statusCode,
    409,
  );
  for (const invalid of [
    { restartLimit: 0 },
    { toolExecution: "unlimited" },
    { stream: { timeoutMs: -1 } },
    { compaction: { modelOverrides: { invalid: {} } } },
  ]) {
    assert.equal(
      (
        await f.app.inject({
          method: "PATCH",
          url: path,
          payload: {
            revision: changed.json().revision,
            runtimePolicy: invalid,
          },
        })
      ).statusCode,
      400,
    );
  }
  const other = await f.service.createStandalone();
  assert.deepEqual(
    (await f.service.configuration(other.sessionId, "1")).runtimePolicy,
    {},
  );
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual((await f.app.inject(path)).json().runtimePolicy, policy);
  const reset = await f.app.inject({
    method: "PATCH",
    url: path,
    payload: { revision: changed.json().revision, runtimePolicy: null },
  });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.deepEqual(reset.json().runtimePolicy, {});
});

for (const afterFailedRun of ["continue", "withdraw"] as const) {
  test(`runtime applies ${afterFailedRun} to queued input after a turn limit`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-failed-queue-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const f = await fixture(directory);
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    const { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    await root.configure(
      { model: { provider: "test", modelId: "test-model" }, maxTurns: 1 },
      context,
    );
    const path = `/v1/sessions/${sessionId}/conversations/${root.id}/configuration`;
    const initial = (await f.app.inject(path)).json();
    const saved = await f.app.inject({
      method: "PATCH",
      url: path,
      payload: {
        revision: initial.revision,
        runtimePolicy: { afterFailedRun },
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    t.after(() => release.resolve());
    f.faux.setResponses([
      async () => {
        entered.resolve();
        await release.promise;
        return fauxAssistantMessage(
          fauxToolCall("bash", { command: "printf checked" }),
          { stopReason: "toolUse" },
        );
      },
      fauxAssistantMessage("Queued work completed."),
    ]);
    const first = await root.submit(
      { type: "input", content: "Use a tool" },
      context,
    );
    await entered.promise;
    const queued = await root.submit(
      { type: "input", content: "Next request", whenBusy: "followUp" },
      context,
    );
    const busy = await f.app.inject({
      method: "PATCH",
      url: path,
      payload: { revision: saved.json().revision, runtimePolicy: null },
    });
    assert.equal(busy.statusCode, 409, busy.body);
    release.resolve();
    assert.equal((await first.wait(context)).status, "unanswered");
    const result = await queued.wait(context);
    assert.equal(
      result.status,
      afterFailedRun === "continue" ? "done" : "unanswered",
    );
    if (result.status === "unanswered")
      assert.equal(result.reason, "run_failed");
    assert.equal(f.faux.state.callCount, afterFailedRun === "continue" ? 2 : 1);
  });
}

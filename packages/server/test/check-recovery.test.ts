import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { SubmissionId, TaskId } from "@earendil-works/pi-durable";
import {
  CheckTask,
  PostRunDoc,
  PostRunEntry,
} from "../src/harnesses/post-run.ts";
import { fixture } from "./support/harness-fixture.ts";

async function waitFile(path: string) {
  for (let i = 0; i < 250; i++) {
    try {
      await readFile(path);
      return;
    } catch {
      await setTimeout(20);
    }
  }
  throw new Error("Check did not start");
}

test("recheck uses the current command, holds queued input, preserves receipts and deduplicates after reopen", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-recheck-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const original = await root.commit(
    (tx) =>
      tx.createTask(
        CheckTask,
        { command: "exit 1" },
        { ownership: { kind: "conversation" } },
      ),
    context,
  );
  assert.equal(
    (await harness.waitForTask(original, context)).state.outcome.result,
    "failed",
  );
  const workspace = await f.service.runtime.standaloneWorkspace(sessionId);
  await root.commit(async (tx) => {
    (await tx.doc(PostRunDoc, root.id)).command =
      "printf started > started; while [ ! -f release ]; do sleep 0.02; done; printf passed >> runs";
  }, context);
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/checks/tasks/${original}/recheck`;
  const payload = { requestId: randomUUID(), acknowledgeEffects: true };
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        payload: { requestId: randomUUID() },
      })
    ).statusCode,
    400,
  );
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  await sibling.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const foreign = await f.app.inject({
    method: "POST",
    url: `/v1/sessions/${sessionId}/conversations/${sibling.id}/checks/tasks/${original}/recheck`,
    payload,
  });
  assert.equal(foreign.statusCode, 404);
  f.faux.setResponses([
    fauxAssistantMessage("Ready to recheck"),
    (request) => {
      assert.match(JSON.stringify(request.messages), /Post-run check passed/);
      return fauxAssistantMessage("Queued input answered");
    },
  ]);
  const response = await f.app.inject({ method: "POST", url, payload });
  assert.equal(response.statusCode, 202, response.body);
  await waitFile(join(workspace, "started"));
  const queued = await f.service.submit(
    sessionId,
    String(root.id),
    "Next request",
    randomUUID(),
  );
  assert.equal(f.faux.state.callCount, 1);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        payload: { ...payload, requestId: randomUUID() },
      })
    ).statusCode,
    409,
  );
  await writeFile(join(workspace, "release"), "go");
  const submitted = await harness.submission(
    queued.id as SubmissionId,
    context,
  );
  assert.ok(submitted);
  assert.equal((await submitted.wait(context)).status, "done");
  await harness.waitForIdle(context);
  assert.equal(await readFile(join(workspace, "runs"), "utf8"), "passed");
  const history = await f.service.taskHistory(sessionId, String(root.id));
  const replacement = history.tasks.find((task) => task.retryOf === original);
  assert.ok(replacement);
  assert.equal(replacement.recheckable, false);
  assert.equal(replacement.checkResult, "passed");
  assert.equal(
    history.tasks.find((task) => task.id === original)?.checkResult,
    "failed",
  );
  assert.equal(
    history.tasks.find((task) => task.id === original)?.recheckable,
    true,
  );
  const entries = (
    await root.entries({}, 100, undefined, context)
  ).items.filter(PostRunEntry.is);
  assert.deepEqual(
    entries.sort((a, b) => a.id - b.id).map((entry) => entry.data.status),
    ["failed", "passed"],
  );
  await f.app.close();
  f = await fixture(directory);
  ({ harness } = await f.service.session(sessionId));
  assert.deepEqual(
    (await f.app.inject({ method: "POST", url, payload })).json(),
    response.json(),
  );
  await harness.waitForIdle(context);
  assert.equal(f.faux.state.callCount, 0);
});

for (const interrupted of [true, false]) {
  test(`explicit recheck recovers a ${interrupted ? "interrupted" : "cancelled"} check`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), "console-recheck-interrupted-"),
    );
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
    const original = await root.commit(
      (tx) =>
        tx.createTask(
          CheckTask,
          { command: "printf started > original-started; sleep 30" },
          { ownership: { kind: "conversation" } },
        ),
      context,
    );
    harness.resume();
    const workspace = await f.service.runtime.standaloneWorkspace(sessionId);
    await waitFile(join(workspace, "original-started"));
    if (interrupted) {
      await f.app.close();
      f = await fixture(directory);
      ({ harness } = await f.service.session(sessionId));
      root = await harness.root(context);
    } else await harness.abortTask(original, context);
    const settled = await harness.waitForTask(original, context);
    assert.equal(
      settled.state.outcome.status,
      interrupted ? "completed" : "aborted",
    );
    if (interrupted) assert.equal(settled.state.outcome.result, "interrupted");
    const url = `/v1/sessions/${sessionId}/conversations/${root.id}/checks/tasks/${original}/recheck`;
    const payload = { requestId: randomUUID(), acknowledgeEffects: true };
    assert.equal(
      (await f.app.inject({ method: "POST", url, payload })).statusCode,
      409,
    );
    await root.commit(async (tx) => {
      (await tx.doc(PostRunDoc, root.id)).command =
        "printf recovered > recovered";
    }, context);
    f.faux.setResponses([fauxAssistantMessage("Rechecking")]);
    const response = await f.app.inject({ method: "POST", url, payload });
    assert.equal(response.statusCode, 202, response.body);
    await harness.waitForIdle(context);
    assert.equal(
      await readFile(join(workspace, "recovered"), "utf8"),
      "recovered",
    );
    const replacement = (
      await f.service.taskHistory(sessionId, String(root.id))
    ).tasks.find((task) => task.retryOf === original);
    assert.ok(replacement);
    const rejected = await f.app.inject({
      method: "POST",
      url: url.replace(
        String(original) + "/recheck",
        String(replacement.id) + "/recheck",
      ),
      payload: { ...payload, requestId: randomUUID() },
    });
    assert.equal(rejected.statusCode, 409);
  });
}

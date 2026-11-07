import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

test("task history paginates terminal receipts, excludes siblings and survives reopening", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-task-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const ids = [];
  for (let n = 0; n < 53; n++) {
    const job = await f.service.scheduleReview(
      sessionId,
      String(root.id),
      "private task input",
      randomUUID(),
      Date.now() + 60000,
    );
    await f.service.stopReview(sessionId, String(root.id), String(job.id));
    await harness.waitForTask(job.id as TaskId, context);
    ids.push(job.id);
  }
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/tasks/history`;
  const first = await f.app.inject(url);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().tasks.length, 50);
  assert.ok(first.json().cursor);
  const second = (
    await f.app.inject(`${url}?cursor=${first.json().cursor}`)
  ).json();
  const tasks = [...first.json().tasks, ...second.tasks];
  assert.deepEqual(
    tasks.map((task) => task.id),
    ids.reverse(),
  );
  assert.equal(second.cursor, undefined);
  assert.ok(
    tasks.every(
      (task) =>
        task.status === "aborted" &&
        task.diagnostic.includes("cancelled") &&
        Number.isFinite(task.endedAt),
    ),
  );
  assert.ok(!first.body.includes("private task input"));
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  const otherUrl = `/v1/sessions/${sessionId}/conversations/${sibling.id}/tasks/history`;
  assert.deepEqual((await f.app.inject(otherUrl)).json().tasks, []);
  const crossed = await f.app.inject(
    `${otherUrl}?cursor=${first.json().cursor}`,
  );
  assert.equal(crossed.statusCode, 400, crossed.body);
  assert.equal((await f.app.inject(`${url}?cursor=not-json`)).statusCode, 400);
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual((await f.app.inject(url)).json(), first.json());
});

test("completed review history links owned task history without exposing task payloads", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  f.faux.setResponses([fauxAssistantMessage("private findings")]);
  const job = await f.service.scheduleReview(
    sessionId,
    String(root.id),
    "private brief",
    randomUUID(),
  );
  await harness.waitForTask(job.id as TaskId, context);
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/tasks/history`;
  const response = await f.app.inject(url);
  const task = response
    .json()
    .tasks.find((task: { id: number }) => task.id === job.id);
  assert.equal(task.status, "completed");
  assert.equal(task.reviewSucceeded, true);
  assert.ok(task.reviewId !== undefined);
  const owned = await f.app.inject(`${url}?reviewId=${task.reviewId}`);
  assert.equal(owned.statusCode, 200, owned.body);
  assert.ok(owned.json().tasks.length > 0);
  assert.ok(!owned.body.includes("private findings"));
  assert.ok(!owned.body.includes("private brief"));
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  const denied = await f.app.inject(
    `/v1/sessions/${sessionId}/conversations/${sibling.id}/tasks/history?reviewId=${task.reviewId}`,
  );
  assert.equal(denied.statusCode, 404);
});

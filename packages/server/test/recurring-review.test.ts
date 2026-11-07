import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { RecurringReview } from "../src/harnesses/recurring-review.ts";
import { fixture } from "./support/harness-fixture.ts";

test("recurring reviews survive reopen, create fresh sequential children and stop at the count", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-recurring-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const id = await root.commit(
    (tx) =>
      tx.createTask(
        RecurringReview,
        {
          review: {
            brief: "Review",
            at: Date.now() + 500,
            model: { provider: "test", modelId: "test-model" },
            thinkingLevel: null,
            delivery: "context",
          },
          recurrence: { intervalMs: 20, occurrences: 2 },
        },
        { ownership: { kind: "conversation" }, background: true },
      ),
    context,
  );
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      fauxAssistantMessage("First review"),
      fauxAssistantMessage("Second review"),
    ]),
  );
  ({ harness } = await f.service.session(sessionId));
  const task = await harness.waitForTask(id, context);
  assert.deepEqual(task.state.outcome, {
    status: "completed",
    result: { completed: 2, succeeded: true },
  });
  const children = await harness.commit(
    (tx) => tx.scanTasks({ conversationId: root.id, status: "terminal" }, 100),
    context,
  );
  const reviews = children.items.filter((child) => child.owner === id);
  assert.equal(reviews.length, 2);
  assert.ok(
    reviews.every((child) => child.state.outcome?.status === "completed"),
  );
  const owned = await harness.commit(
    async (tx) =>
      Promise.all(
        reviews.map((review) =>
          tx.scanConversations({ ownerTaskId: review.id }, 1),
        ),
      ),
    context,
  );
  const first = owned[0]?.items[0];
  const second = owned[1]?.items[0];
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.id, second.id);
});

test("recurring review API validates bounds, deduplicates and enforces cancellation ownership", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-recurring-api-"));
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
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/reviews`;
  const payload = {
    brief: "Review",
    requestId: randomUUID(),
    at: Date.now() + 60000,
    recurrence: { intervalMs: 60000, occurrences: 2 },
  };
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        payload: { ...payload, recurrence: { intervalMs: 1, occurrences: 2 } },
      })
    ).statusCode,
    400,
  );
  const created = await f.app.inject({ method: "POST", url, payload });
  assert.equal(created.statusCode, 202, created.body);
  assert.deepEqual(
    (await f.app.inject({ method: "POST", url, payload })).json(),
    created.json(),
  );
  const { id } = created.json();
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `/v1/sessions/${sessionId}/conversations/${sibling.id}/reviews/tasks/${id}`,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await f.app.inject({ method: "DELETE", url: `${url}/tasks/${id}` }))
      .statusCode,
    200,
  );
  assert.equal(
    (await harness.waitForTask(id as TaskId, context)).state.outcome?.status,
    "aborted",
  );
});

for (const cancel of [false, true]) {
  test(`recurring review ${cancel ? "cancellation stops the active child" : "failure prevents later occurrences"}`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-recurring-stop-"));
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
    const started = Promise.withResolvers<void>();
    let aborted = false;
    f.faux.setResponses([
      async (_request, options) => {
        started.resolve();
        if (cancel) {
          await new Promise<void>((resolve) => {
            if (options?.signal?.aborted) resolve();
            else
              options?.signal?.addEventListener("abort", () => resolve(), {
                once: true,
              });
          });
          aborted = true;
        }
        return fauxAssistantMessage("");
      },
    ]);
    const job = await f.service.scheduleReview(
      sessionId,
      String(root.id),
      "Review",
      randomUUID(),
      undefined,
      "display",
      { recurrence: { intervalMs: 60000, occurrences: 3 } },
    );
    await started.promise;
    if (cancel) {
      await f.service.stopConversation(sessionId, String(root.id));
      assert.equal(
        aborted,
        false,
        "Parent Stop must leave its background schedule running",
      );
      await f.service.stopReview(sessionId, String(root.id), String(job.id));
      assert.equal(aborted, true);
    }
    const task = await harness.waitForTask(job.id as TaskId, context);
    assert.equal(task.state.outcome?.status, cancel ? "aborted" : "failed");
    const children = await harness.commit(
      (tx) =>
        tx.scanTasks({ conversationId: root.id, status: "terminal" }, 100),
      context,
    );
    assert.equal(
      children.items.filter((child) => child.owner === job.id).length,
      1,
    );
    assert.equal(f.faux.state.callCount, 1);
  });
}

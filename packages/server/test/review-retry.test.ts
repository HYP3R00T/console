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

for (const cancelled of [true, false]) {
  test(`retry ${cancelled ? "cancelled" : "unsuccessful"} review preserves settings and deduplicates across restart`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-review-retry-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    let { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    const model = { provider: "test", modelId: "reasoning-model" };
    await root.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    if (!cancelled) f.faux.setResponses([fauxAssistantMessage("")]);
    const original = await f.service.scheduleReview(
      sessionId,
      String(root.id),
      "original review brief",
      randomUUID(),
      cancelled ? Date.now() + 60000 : undefined,
      "context",
      { model, maxTurns: 2, thinkingLevel: null },
    );
    const base = `/v1/sessions/${sessionId}/conversations/${root.id}`;
    const url = `${base}/reviews/tasks/${original.id}/retry`;
    if (cancelled) {
      assert.equal(
        (
          await f.app.inject({
            method: "POST",
            url,
            payload: { requestId: randomUUID() },
          })
        ).statusCode,
        409,
      );
      await f.service.stopReview(
        sessionId,
        String(root.id),
        String(original.id),
      );
    }
    await harness.waitForTask(original.id as TaskId, context);
    const history = (await f.app.inject(`${base}/tasks/history`)).json();
    assert.equal(
      history.tasks.find((task: { id: number }) => task.id === original.id)
        .retryable,
      true,
    );
    f.faux.setResponses([
      (request) => {
        assert.match(JSON.stringify(request.messages), /original review brief/);
        return fauxAssistantMessage("Retried review findings");
      },
    ]);
    const requestId = randomUUID();
    const response = await f.app.inject({
      method: "POST",
      url,
      payload: { requestId },
    });
    assert.equal(response.statusCode, 202, response.body);
    const retryId = response.json().id as TaskId;
    assert.notEqual(retryId, original.id);
    await harness.waitForTask(retryId, context);
    const task = await harness.commit((tx) => tx.task(retryId), context);
    assert.ok(task);
    assert.deepEqual((task.input as { model: unknown }).model, model);
    assert.equal((task.input as { maxTurns: number }).maxTurns, 2);
    const updated = (await f.app.inject(`${base}/tasks/history`)).json();
    const receipt = updated.tasks.find(
      (task: { id: number }) => task.id === retryId,
    );
    assert.equal(receipt.retryOf, original.id);
    assert.equal(receipt.retryable, false);
    assert.ok(
      JSON.stringify((await root.context(context)).messages).includes(
        "Retried review findings",
      ),
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `${base}/reviews/tasks/${retryId}/retry`,
          payload: { requestId: randomUUID() },
        })
      ).statusCode,
      409,
    );
    const sibling = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      context,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/sessions/${sessionId}/conversations/${sibling.id}/reviews/tasks/${original.id}/retry`,
          payload: { requestId },
        })
      ).statusCode,
      404,
    );
    await f.app.close();
    f = await fixture(directory);
    ({ harness } = await f.service.session(sessionId));
    const repeated = await f.app.inject({
      method: "POST",
      url,
      payload: { requestId },
    });
    assert.deepEqual(repeated.json(), response.json());
    await harness.waitForIdle(context);
    assert.equal(f.faux.state.callCount, 0);
  });
}

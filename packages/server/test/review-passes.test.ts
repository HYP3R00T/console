import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  type ConversationId,
  type TaskId,
} from "@earendil-works/pi-durable";
import { BackgroundReviewEntry } from "../src/harnesses/background-review.ts";
import { fixture } from "./support/harness-fixture.ts";

test("review passes resume mid-review without resetting the limit and deliver once", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-passes-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  let parent = await harness.root(context);
  await parent.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const started = Promise.withResolvers<void>();
  f.faux.setResponses([
    fauxAssistantMessage("First pass: potential issue A"),
    async (request, options) => {
      assert.match(JSON.stringify(request.messages), /Review pass 2 of 3/);
      started.resolve();
      await new Promise<void>((resolve) => {
        if (options?.signal?.aborted) resolve();
        else
          options?.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
      });
      return fauxAssistantMessage("Interrupted", { stopReason: "aborted" });
    },
  ]);
  const url = `/v1/sessions/${sessionId}/conversations/${parent.id}/reviews`;
  const admitted = await f.app.inject({
    method: "POST",
    url,
    payload: {
      brief: "Review all issues",
      requestId: randomUUID(),
      passes: 3,
      maxTurns: 2,
    },
  });
  assert.equal(admitted.statusCode, 202, admitted.body);
  const taskId = admitted.json().id as TaskId;
  await started.promise;
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      (request) => {
        assert.match(JSON.stringify(request.messages), /Review pass 2 of 3/);
        return fauxAssistantMessage("Second pass: A confirmed, B found");
      },
      (request) => {
        assert.match(JSON.stringify(request.messages), /Review pass 3 of 3/);
        return fauxAssistantMessage("Final findings: A and B");
      },
    ]),
  );
  ({ harness } = await f.service.session(sessionId));
  parent = await harness.root(context);
  await harness.waitForTask(taskId, context);
  const entries = (await parent.entries({}, 100, undefined, context)).items;
  const reports = entries.filter(BackgroundReviewEntry.is);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.text, "Final findings: A and B");
  assert.ok(reports[0].data.reviewId);
  const child = await harness.conversation(
    reports[0].data.reviewId as ConversationId,
    context,
  );
  assert.ok(child);
  const answers = (
    await child.entries({}, 100, undefined, context)
  ).items.filter(
    (entry) =>
      AssistantEntry.is(entry) &&
      entry.model?.some(
        (message) =>
          message.role === "assistant" && message.stopReason === "stop",
      ),
  );
  assert.equal(answers.length, 3);
  assert.equal(f.faux.state.callCount, 2);
  const invalid = await f.app.inject({
    method: "POST",
    url,
    payload: { brief: "Review", requestId: randomUUID(), passes: 6 },
  });
  assert.equal(invalid.statusCode, 400);
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

test("scheduled reviewer selection survives restart without changing its parent", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-options-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Review", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  let { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const model = { provider: "test", modelId: "reasoning-model" };
  const { models } = await f.providers.favorites();
  const thinkingLevel = models
    .find((m) => m.id === model.modelId)
    ?.thinkingLevels.at(-1);
  assert.ok(thinkingLevel);
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/reviews`;
  const payload = {
    brief: "Inspect the workspace",
    requestId: randomUUID(),
    at: Date.now() + 1500,
    model,
    thinkingLevel,
    maxTurns: 1,
  };
  const admitted = await f.app.inject({ method: "POST", url, payload });
  assert.equal(admitted.statusCode, 202, admitted.body);
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("read", { path: "missing.txt" }), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage("This must not run beyond the cap."),
    ]),
  );
  ({ harness } = await f.service.session(sessionId));
  const taskId = admitted.json().id as TaskId;
  await harness.waitForTask(taskId, context);
  await harness.waitForIdle(context);
  assert.equal(f.faux.state.callCount, 1);
  const childId = await harness.commit(
    async (tx) =>
      (await tx.scanConversations({ ownerTaskId: taskId }, 1)).items[0]?.id,
    context,
  );
  assert.ok(childId !== undefined);
  const child = await harness.conversation(childId, context);
  assert.ok(child);
  const reviewer = await child.agent(context);
  assert.deepEqual(reviewer.model, model);
  assert.equal(reviewer.thinkingLevel, thinkingLevel);
  assert.equal(reviewer.maxTurns, 1);
  const parent = await harness.root(context);
  assert.equal((await parent.agent(context)).model?.modelId, "test-model");
  const repeated = await f.app.inject({ method: "POST", url, payload });
  assert.deepEqual(repeated.json(), admitted.json());
  assert.equal(f.faux.state.callCount, 1);
});

test("review selection rejects unavailable models, unsupported thinking and invalid caps", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-validation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Review", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/reviews`;
  for (const [selection, status] of [
    [{ model: { provider: "test", modelId: "absent" } }, 409],
    [{ thinkingLevel: "unsupported" }, 400],
    [{ maxTurns: 0 }, 400],
    [{ maxTurns: 51 }, 400],
    [{ maxTurns: 1.5 }, 400],
  ] as const) {
    const response = await f.app.inject({
      method: "POST",
      url,
      payload: {
        brief: "Review",
        requestId: randomUUID(),
        model: { provider: "test", modelId: "test-model" },
        ...selection,
      },
    });
    assert.equal(response.statusCode, status, response.body);
  }
  assert.equal(f.faux.state.callCount, 0);
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { SandboxDoc } from "../src/execution/sandbox.ts";
import { PostRunDoc } from "../src/harnesses/post-run.ts";
import { fixture } from "./support/harness-fixture.ts";

for (const cancelled of [true, false]) {
  test(`retry ${cancelled ? "cancelled" : "unsuccessful"} job preserves settings and deduplicates across restart`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-job-retry-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    let { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    const model = { provider: "test", modelId: "reasoning-model" };
    await root.configure(
      {
        model,
        tools: (CodingTools.tools ?? []).filter((tool) => tool.name === "read"),
        instructions: "Original worker role",
        maxTurns: 2,
      },
      context,
    );
    await root.commit(async (tx) => {
      (await tx.doc(PostRunDoc, root.id)).command = "printf original";
    }, context);
    if (!cancelled) f.faux.setResponses([fauxAssistantMessage("")]);
    const original = await f.service.scheduleJob(
      sessionId,
      String(root.id),
      "original job brief",
      randomUUID(),
      cancelled ? Date.now() + 60000 : undefined,
      "context",
    );
    const base = `/v1/sessions/${sessionId}/conversations/${root.id}`;
    const url = `${base}/jobs/tasks/${original.id}/retry`;
    if (cancelled) {
      assert.equal(
        (
          await f.app.inject({
            method: "POST",
            url,
            payload: { requestId: randomUUID(), acknowledgeEffects: true },
          })
        ).statusCode,
        409,
      );
      await f.service.stopJob(sessionId, String(root.id), String(original.id));
    }
    await harness.waitForTask(original.id as TaskId, context);
    const history = (await f.app.inject(`${base}/tasks/history`)).json();
    assert.equal(
      history.tasks.find((task: { id: number }) => task.id === original.id)
        .retryable,
      true,
    );
    await root.configure(
      {
        model: { provider: "test", modelId: "test-model" },
        instructions: "Changed parent role",
        maxTurns: 8,
      },
      context,
    );
    await root.commit(async (tx) => {
      (await tx.doc(PostRunDoc, root.id)).command = "printf changed";
    }, context);
    f.faux.setResponses([
      (request, _options, _state, actualModel) => {
        assert.equal(actualModel.id, "reasoning-model");
        assert.match(JSON.stringify(request.messages), /original job brief/);
        return fauxAssistantMessage("Retried job findings");
      },
    ]);
    const requestId = randomUUID();
    const response = await f.app.inject({
      method: "POST",
      url,
      payload: { requestId, acknowledgeEffects: true },
    });
    assert.equal(response.statusCode, 202, response.body);
    const retryId = response.json().id as TaskId;
    assert.notEqual(retryId, original.id);
    await harness.waitForTask(retryId, context);
    const task = await harness.commit((tx) => tx.task(retryId), context);
    assert.ok(task);
    const input = task.input as {
      postRun: { command: string };
      agent: {
        model: unknown;
        maxTurns: number;
        instructions: string;
        tools: string[];
      };
    };
    assert.equal(input.postRun.command, "printf original");
    assert.deepEqual(input.agent.model, model);
    assert.equal(input.agent.maxTurns, 2);
    assert.equal(input.agent.instructions, "Original worker role");
    assert.deepEqual(input.agent.tools, ["read"]);
    const updated = (await f.app.inject(`${base}/tasks/history`)).json();
    const receipt = updated.tasks.find(
      (task: { id: number }) => task.id === retryId,
    );
    assert.equal(receipt.retryOf, original.id);
    assert.equal(receipt.retryable, false);
    assert.ok(
      JSON.stringify((await root.context(context)).messages).includes(
        "Retried job findings",
      ),
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `${base}/jobs/tasks/${retryId}/retry`,
          payload: { requestId: randomUUID(), acknowledgeEffects: true },
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
          url: `/v1/sessions/${sessionId}/conversations/${sibling.id}/jobs/tasks/${original.id}/retry`,
          payload: { requestId, acknowledgeEffects: true },
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
      payload: { requestId, acknowledgeEffects: true },
    });
    assert.deepEqual(repeated.json(), response.json());
    await harness.waitForIdle(context);
    assert.equal(f.faux.state.callCount, 0);
  });
}

test("job retry requires acknowledgement and rejects changed capabilities and workspace policy", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-job-retry-policy-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    {
      model: { provider: "test", modelId: "reasoning-model" },
      tools: (CodingTools.tools ?? []).filter((tool) => tool.name === "read"),
    },
    context,
  );
  const original = await f.service.scheduleJob(
    sessionId,
    String(root.id),
    "Read",
    randomUUID(),
    Date.now() + 60000,
  );
  await f.service.stopJob(sessionId, String(root.id), String(original.id));
  await harness.waitForTask(original.id as TaskId, context);
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/jobs/tasks/${original.id}/retry`;
  for (const acknowledgeEffects of [undefined, false]) {
    const response = await f.app.inject({
      method: "POST",
      url,
      payload: { requestId: randomUUID(), acknowledgeEffects },
    });
    assert.equal(response.statusCode, 400, response.body);
  }
  const retry = () =>
    f.app.inject({
      method: "POST",
      url,
      payload: { requestId: randomUUID(), acknowledgeEffects: true },
    });
  await root.configure({ tools: [] }, context);
  assert.equal((await retry()).statusCode, 409);
  await root.configure(
    { tools: (CodingTools.tools ?? []).filter((tool) => tool.name === "read") },
    context,
  );
  await root.commit(async (tx) => {
    (await tx.doc(SandboxDoc, root.id)).enabled = true;
  }, context);
  assert.equal((await retry()).statusCode, 409);
  await root.commit(async (tx) => {
    (await tx.doc(SandboxDoc, root.id)).enabled = false;
  }, context);
  await f.providers.store.setFavorite("test", "reasoning-model", false);
  assert.equal((await retry()).statusCode, 409);
  const tasks = await f.service.taskHistory(sessionId, String(root.id));
  assert.equal(tasks.tasks.length, 1);
  assert.equal(tasks.tasks[0].id, original.id);
  assert.equal(f.faux.state.callCount, 0);
});

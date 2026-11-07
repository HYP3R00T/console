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

const profile = () => ({
  id: randomUUID(),
  name: "Security review",
  model: { provider: "test", modelId: "reasoning-model" },
  thinkingLevel: null,
  maxTurns: 3,
  instructions: "Focus on input validation and authorization boundaries.",
});
const url = "/v1/machine/reviewer-profiles";

test("reviewer profiles validate, reject stale writes and persist their lifecycle", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-profiles-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const saved = profile();
  const put = (revision: number, profiles: unknown[]) =>
    f.app.inject({ method: "PUT", url, payload: { revision, profiles } });
  assert.equal((await f.app.inject(url)).json().revision, 0);
  for (const invalid of [
    { ...saved, name: " " },
    { ...saved, maxTurns: 0 },
    { ...saved, thinkingLevel: "bogus" },
    { ...saved, model: { provider: "test", modelId: "absent" } },
  ]) {
    assert.ok([400, 409].includes((await put(0, [invalid])).statusCode));
  }
  assert.equal(
    (await put(0, [saved, { ...saved, id: randomUUID() }])).statusCode,
    400,
  );
  const created = await put(0, [saved]);
  assert.equal(created.statusCode, 200, created.body);
  assert.equal((await put(0, [])).statusCode, 409);
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual((await f.app.inject(url)).json().profiles, [saved]);
  assert.equal(
    (await put(1, [{ ...saved, name: "Boundary review" }])).statusCode,
    200,
  );
  assert.equal((await put(2, [])).statusCode, 200);
  assert.deepEqual((await f.app.inject(url)).json().profiles, []);
});

test("scheduled profiles are immutable snapshots and retries retain deleted profile instructions", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-profile-review-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const saved = profile();
  await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: 0, profiles: [saved] },
  });
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const base = `/v1/sessions/${sessionId}/conversations/${root.id}`;
  const payload = {
    requestId: randomUUID(),
    brief: "Review this workspace",
    profileId: saved.id,
    at: Date.now() + 1500,
  };
  const admitted = await f.app.inject({
    method: "POST",
    url: `${base}/reviews`,
    payload,
  });
  assert.equal(admitted.statusCode, 202, admitted.body);
  const conflict = await f.app.inject({
    method: "POST",
    url: `${base}/reviews`,
    payload: { ...payload, requestId: randomUUID(), maxTurns: 4 },
  });
  assert.equal(conflict.statusCode, 400);
  await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: 1, profiles: [] },
  });
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      (request) => {
        assert.match(
          JSON.stringify(request),
          /Focus on input validation and authorization boundaries/,
        );
        return fauxAssistantMessage("");
      },
    ]),
  );
  ({ harness } = await f.service.session(sessionId));
  await harness.waitForTask(admitted.json().id as TaskId, context);
  f.faux.setResponses([
    (request) => {
      assert.match(
        JSON.stringify(request),
        /Focus on input validation and authorization boundaries/,
      );
      return fauxAssistantMessage("No issues found.");
    },
  ]);
  const retry = await f.app.inject({
    method: "POST",
    url: `${base}/reviews/tasks/${admitted.json().id}/retry`,
    payload: { requestId: randomUUID() },
  });
  assert.equal(retry.statusCode, 202, retry.body);
  await harness.waitForTask(retry.json().id as TaskId, context);
  const childId = await harness.commit(
    async (tx) =>
      (
        await tx.scanConversations(
          { ownerTaskId: retry.json().id as TaskId },
          1,
        )
      ).items[0].id,
    context,
  );
  const child = await harness.conversation(childId, context);
  assert.ok(child);
  const agent = await child.agent(context);
  assert.deepEqual(agent.model, saved.model);
  assert.equal(agent.maxTurns, saved.maxTurns);
  assert.equal(agent.instructions, saved.instructions);
  assert.deepEqual(
    agent.tools.map((tool) => tool.name),
    ["read"],
  );
  const missing = await f.app.inject({
    method: "POST",
    url: `${base}/reviews`,
    payload: { ...payload, requestId: randomUUID() },
  });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(
    (
      await f.app.inject({ method: "POST", url: `${base}/reviews`, payload })
    ).json(),
    admitted.json(),
  );
});

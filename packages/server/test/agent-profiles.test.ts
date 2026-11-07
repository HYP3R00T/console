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
  tools: ["read"],
  instructions: "Focus on input validation and authorization boundaries.",
});
const url = "/v1/machine/agent-profiles";

test("agent profiles validate, reject stale writes and persist their lifecycle", async (t) => {
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
    { ...saved, tools: ["read", "read"] },
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

test("agent profiles are copied into jobs and agents without widening parent tool access", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-agent-profile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const saved = profile();
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: { revision: 0, profiles: [saved] },
      })
    ).statusCode,
    200,
  );
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const base = `/v1/sessions/${sessionId}/conversations/${root.id}`;
  const agentPayload = {
    id: randomUUID(),
    name: "Research",
    profileId: saved.id,
  };
  const agent = await f.app.inject({
    method: "POST",
    url: `${base}/agents`,
    payload: agentPayload,
  });
  assert.equal(agent.statusCode, 201, agent.body);
  const child = await harness.conversation(
    agent.json().conversationId,
    context,
  );
  assert.ok(child);
  const settings = await child.agent(context);
  assert.deepEqual(settings.model, saved.model);
  assert.deepEqual(
    settings.tools.map((tool) => tool.name),
    ["read"],
  );
  assert.equal(settings.instructions, saved.instructions);
  const payload = {
    content: "Analyze",
    requestId: randomUUID(),
    at: Date.now() + 700,
    profileId: saved.id,
  };
  const job = await f.app.inject({
    method: "POST",
    url: `${base}/jobs`,
    payload,
  });
  assert.equal(job.statusCode, 202, job.body);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: { revision: 1, profiles: [] },
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(
    (
      await f.app.inject({ method: "POST", url: `${base}/jobs`, payload })
    ).json(),
    job.json(),
  );
  assert.deepEqual(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/agents`,
        payload: agentPayload,
      })
    ).json(),
    agent.json(),
  );
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      (request, _options, _state, model) => {
        assert.equal(model.id, saved.model.modelId);
        assert.match(
          JSON.stringify(request.messages),
          /input validation and authorization/,
        );
        const tools = request.messages.flatMap((message) =>
          message.role === "system" ? (message.toolsAdded ?? []) : [],
        );
        assert.deepEqual(
          tools.map((tool) => tool.name),
          ["read"],
        );
        return fauxAssistantMessage("Profile job done");
      },
    ]),
  );
  ({ harness } = await f.service.session(sessionId));
  const receipt = await harness.waitForTask(
    job.json().id as TaskId<boolean>,
    context,
  );
  assert.equal(receipt.state.outcome?.result, true);
  const disallowed = { ...saved, tools: ["write"] };
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: { revision: 2, profiles: [disallowed] },
      })
    ).statusCode,
    200,
  );
  const reopened = await harness.root(context);
  await reopened.configure({ tools: [] }, context);
  const denied = await f.app.inject({
    method: "POST",
    url: `${base}/jobs`,
    payload: { ...payload, requestId: randomUUID() },
  });
  assert.equal(denied.statusCode, 409, denied.body);
});

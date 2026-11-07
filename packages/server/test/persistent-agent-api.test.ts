import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

test("agent HTTP controls enforce parent scope, validate admission and deduplicate messages", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-agent-api-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const parent = await harness.root(context);
  const base = `/v1/sessions/${sessionId}/conversations/${parent.id}`;
  const id = randomUUID();
  const payload = { id, name: "Researcher" };
  const create = () =>
    f.app.inject({ method: "POST", url: `${base}/agents`, payload });
  assert.equal((await create()).statusCode, 409);
  await parent.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const created = await create();
  assert.equal(created.statusCode, 201, created.body);
  assert.deepEqual((await create()).json(), created.json());
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/agents`,
        payload: { id: randomUUID(), name: "researcher" },
      })
    ).statusCode,
    409,
  );
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  const wrong = `/v1/sessions/${sessionId}/conversations/${sibling.id}/agents/${id}`;
  assert.equal((await f.app.inject({ url: wrong })).statusCode, 404);
  assert.equal(
    (await f.app.inject({ method: "POST", url: `${wrong}/stop`, payload: {} }))
      .statusCode,
    404,
  );
  const message = {
    content: "Inspect the project",
    requestId: randomUUID(),
    delivery: "context",
  };
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${wrong}/messages`,
        payload: message,
      })
    ).statusCode,
    404,
  );
  f.faux.setResponses([fauxAssistantMessage("Found the cobalt marker")]);
  const send = () =>
    f.app.inject({
      method: "POST",
      url: `${base}/agents/${id}/messages`,
      payload: message,
    });
  const admitted = await send();
  assert.equal(admitted.statusCode, 202, admitted.body);
  await harness.waitForTask(admitted.json().id, context);
  assert.deepEqual((await send()).json(), admitted.json());
  assert.equal(f.faux.state.callCount, 1);
  const list = await f.app.inject({ url: `${base}/agents` });
  assert.equal(list.json().agents.length, 1);
  assert.equal(list.json().agents[0].busy, false);
  const snapshot = await f.app.inject({ url: `${base}/agents/${id}` });
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  assert.match(JSON.stringify(snapshot.json().messages), /cobalt marker/);
  const visible = messages(
    (await parent.entries({}, 100, undefined, context)).items,
  );
  assert.equal(
    visible.filter((message) => message.text.includes("cobalt marker")).length,
    1,
  );
  assert.match(visible.at(-1)?.activityLabel ?? "", /Agent Researcher/);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/agents/${id}/stop`,
        payload: {},
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/agents/${id}/messages`,
        payload: { ...message, requestId: randomUUID(), content: " " },
      })
    ).statusCode,
    400,
  );
  f.service.store.setTokenBudget(sessionId, 0);
  assert.deepEqual((await send()).json(), admitted.json());
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/agents/${id}/messages`,
        payload: { ...message, requestId: randomUUID() },
      })
    ).statusCode,
    409,
  );
});

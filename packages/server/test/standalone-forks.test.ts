import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { fixture } from "./support/harness-fixture.ts";

test("standalone forks retain ancestry, remain discoverable after parent archive and survive restart", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-standalone-forks-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  f.faux.setResponses([fauxAssistantMessage("Original answer")]);
  await f.service.submit(
    sessionId,
    String(root.id),
    "Original question",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await harness.waitForIdle(context);
  const at = (
    await root.entries({ order: "ascending" }, 100, undefined, context)
  ).items.at(-1)?.id;
  assert.ok(at);
  const payload = { at, creationId: randomUUID() };
  const fork = () =>
    f.app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionId}/conversations/${root.id}/fork`,
      payload,
    });
  const response = await fork();
  assert.equal(response.statusCode, 201, response.body);
  const branch = response.json();
  assert.deepEqual((await fork()).json(), branch);
  const route = `/v1/standalone/${sessionId}/${branch.id}`;
  let detail = (await f.app.inject(route)).json();
  assert.equal(detail.conversationId, branch.id);
  assert.deepEqual(detail.parent, { conversationId: root.id, at });
  assert.equal(detail.conversations.length, 2);
  assert.deepEqual(
    (await f.service.listStandalone()).sessions
      .map((item) => item.conversationId)
      .sort((a, b) => a - b),
    [root.id, branch.id],
  );
  const child = await harness.conversation(branch.id, context);
  assert.ok(child);
  assert.match(
    JSON.stringify((await child.context(context)).messages),
    /Original answer/,
  );
  assert.equal(
    (await child.agent(context)).cwd,
    (await root.agent(context)).cwd,
  );
  await f.service.archiveConversation(sessionId, String(root.id), false);
  assert.equal(
    (await f.app.inject(`/v1/standalone/${sessionId}`)).statusCode,
    404,
  );
  assert.equal((await f.app.inject(route)).statusCode, 200);
  assert.deepEqual(
    (await f.service.listStandalone()).sessions.map(
      (item) => item.conversationId,
    ),
    [branch.id],
  );
  await assert.rejects(
    () => f.service.deleteArchivedConversation(sessionId, String(root.id)),
    /fork|depend/i,
  );
  await f.app.close();
  f = await fixture(directory);
  detail = (await f.app.inject(route)).json();
  assert.equal(detail.conversationId, branch.id);
  assert.deepEqual(detail.parent, { conversationId: root.id, at });
  assert.equal(detail.conversations.length, 1);
  await f.service.restoreConversation(sessionId, String(root.id));
  assert.deepEqual((await fork()).json(), branch);
  await f.service.archiveConversation(sessionId, String(branch.id), false);
  assert.equal((await f.app.inject(route)).statusCode, 404);
  assert.equal((await f.service.listStandalone()).sessions.length, 1);
  await f.service.restoreConversation(sessionId, String(branch.id));
  assert.equal((await f.app.inject(route)).statusCode, 200);
  const other = await f.service.createStandalone();
  assert.equal(
    (await f.app.inject(`/v1/standalone/${other.sessionId}/${branch.id}`))
      .statusCode,
    404,
  );
});

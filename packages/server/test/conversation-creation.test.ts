import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { fixture } from "./support/harness-fixture.ts";

test("project forks preserve historical settings and attachments with fresh lifecycle state", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-fork-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const list = `/v1/sessions/${sessionId}/conversations`;
  const source = `${list}/${root.id}`;
  const attachment = Buffer.from("Forkable evidence").toString("base64");
  f.faux.setResponses([fauxAssistantMessage("Parent reply")]);
  const submitted = await f.app.inject({
    method: "POST",
    url: `${source}/messages`,
    payload: {
      content: "Parent prompt",
      requestId: randomUUID(),
      model: { provider: "test", modelId: "test-model" },
      attachments: [
        { name: "evidence.txt", mimeType: "text/plain", data: attachment },
      ],
    },
  });
  assert.equal(submitted.statusCode, 202, submitted.body);
  await harness.waitForIdle(context);
  await root.configure(
    { model: { provider: "test", modelId: "reasoning-model" } },
    context,
  );
  const at = (await f.app.inject(`${source}/history`)).json().messages[0]
    .entryId;
  const creationId = randomUUID();
  const fork = (parent: string) =>
    f.app.inject({
      method: "POST",
      url: `${parent}/fork`,
      payload: { at, creationId },
    });
  assert.equal((await fork(`${list}/${sibling.id}`)).statusCode, 404);
  const [created, retry] = await Promise.all([fork(source), fork(source)]);
  assert.equal(created.statusCode, 201, created.body);
  assert.deepEqual(retry.json(), created.json());
  const branch = created.json();
  const path = `${list}/${branch.id}`;
  assert.deepEqual(
    (await f.app.inject(list))
      .json()
      .conversations.find((item: { id: number }) => item.id === branch.id)
      .parent,
    { conversationId: root.id, at },
  );
  assert.deepEqual(
    (await f.app.inject(`${path}/history`))
      .json()
      .messages.map((message: { text: string }) => message.text),
    ["Parent prompt"],
  );
  const config = (await f.app.inject(`${path}/configuration`)).json().context;
  assert.equal(config.model.id, "test-model");
  assert.equal(config.usage, null);
  assert.equal((await f.app.inject(`${path}/submissions`)).json().latest, null);
  assert.equal(
    (await f.app.inject(`${path}/entries/${at}/attachments/0`)).json().data,
    attachment,
  );
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual((await fork(source)).json(), branch);
});

test("first-send creation retries reuse conversations across concurrent requests and restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-draft-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "project");
  mkdirSync(path);
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", path);
  const session = (await f.service.list(project.id)).sessions[0];
  const projectUrl = `/v1/sessions/${session.sessionId}/conversations`;
  const standaloneId = randomUUID();
  const projectId = randomUUID();
  const create = (url: string, creationId: string) =>
    f.app.inject({ method: "POST", url, payload: { creationId } });
  const [a, b] = await Promise.all([
    create(projectUrl, projectId),
    create(projectUrl, projectId),
  ]);
  assert.equal(a.statusCode, 201, a.body);
  assert.deepEqual(a.json(), b.json());
  assert.equal(
    (await f.service.conversations(session.sessionId)).conversations.length,
    2,
  );
  const [c, d] = await Promise.all([
    create("/v1/standalone", standaloneId),
    create("/v1/standalone", standaloneId),
  ]);
  assert.equal(c.statusCode, 201, c.body);
  assert.equal(c.json().sessionId, d.json().sessionId);
  assert.equal((await f.service.listStandalone()).sessions.length, 1);
  const detail = await f.service.standalone(standaloneId);
  f.faux.setResponses([fauxAssistantMessage("First answer")]);
  const message = {
    content: "First prompt",
    requestId: randomUUID(),
    model: { provider: "test", modelId: "test-model" },
  };
  const messageUrl = `/v1/sessions/${standaloneId}/conversations/${detail.conversationId}/messages`;
  const first = await f.app.inject({
    method: "POST",
    url: messageUrl,
    payload: message,
  });
  assert.equal(first.statusCode, 202, first.body);
  const retry = await f.app.inject({
    method: "POST",
    url: messageUrl,
    payload: message,
  });
  assert.equal(retry.json().id, first.json().id);
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual((await create(projectUrl, projectId)).json(), a.json());
  assert.equal(
    (await create("/v1/standalone", standaloneId)).json().sessionId,
    standaloneId,
  );
  assert.equal(
    (await f.service.conversations(session.sessionId)).conversations.length,
    2,
  );
  assert.equal((await f.service.listStandalone()).sessions.length, 1);
  assert.equal(
    (await create("/v1/standalone", session.sessionId)).statusCode,
    409,
  );
  assert.equal((await create(projectUrl, "invalid")).statusCode, 400);
});

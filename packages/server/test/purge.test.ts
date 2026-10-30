import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";

const headers = { "x-console-request": "1" };

test("permanent deletion erases trashed leaf history, protects fork dependencies and preserves project files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-purge-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const app = createApp(
    {},
    { dataDirectory: join(directory, "private"), models: () => models },
  );
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  async function post(url: string, payload: object = {}) {
    const response = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    assert.ok(response.statusCode < 300, response.body);
    return response.json();
  }
  async function remove(url: string, status = 204) {
    const response = await app.inject({ method: "DELETE", url, headers });
    assert.equal(response.statusCode, status, response.body);
  }
  const project = await post("/v1/workspaces", {
    name: "Kept",
    path: join(directory, "source"),
    createDirectory: true,
    requestId: "project",
  });
  await writeFile(join(project.path, "keep.txt"), "user source");
  const session = await post("/v1/sessions", {
    workspaceId: project.id,
    requestId: "session",
  });
  const base = `/v1/sessions/${session.id}`;
  const provider = (await app.inject("/v1/providers?connected=true")).json()[0];
  const configuration = {
    provider: provider.id,
    model: provider.models[0].id,
    thinkingLevel: "off",
  };
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: configuration,
  });
  const leaf = await post(`${base}/conversations`, { requestId: "leaf" });
  const leafBase = `${base}/conversations/${leaf.id}`;
  faux.setResponses([fauxAssistantMessage("erase this fixture")]);
  await post(`${leafBase}/messages`, {
    text: "test history",
    requestId: "input",
  });
  let history = (await app.inject(leafBase)).json();
  for (let n = 0; n < 200; n++) {
    history = (await app.inject(leafBase)).json();
    if (history.status === "idle" && history.messages.length > 1) break;
    await new Promise((accept) => setTimeout(accept, 10));
  }
  const fork = await post(`${leafBase}/fork`, {
    entryId: history.messages.at(-1).entryId,
    requestId: "fork",
  });
  await remove(`${leafBase}/permanent`, 409);
  await remove(leafBase);
  await remove(`${leafBase}/permanent`, 409);
  const forkBase = `${base}/conversations/${fork.id}`;
  await remove(forkBase);
  await remove(`${forkBase}/permanent`);
  await remove(`${leafBase}/permanent`);
  assert.equal((await app.inject(leafBase)).statusCode, 404);
  assert.deepEqual(
    (await app.inject(`${base}/conversations/trash`)).json(),
    [],
  );
  const sqlite = new DatabaseSync(
    join(directory, "private/sessions", session.id, "conversation.sqlite"),
  );
  try {
    assert.equal(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM entries WHERE conversation_id=?")
        .get(leaf.id)?.n,
      0,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM document_revisions WHERE content LIKE '%erase this fixture%'",
        )
        .get()?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
  const later = await post(`${base}/conversations`, { requestId: "later" });
  assert.ok(Number(later.id) > Number(fork.id));
  await remove(`${base}/conversations/${session.conversationId}`);
  await remove(
    `${base}/conversations/${session.conversationId}/permanent`,
    409,
  );
  await remove(`${base}/permanent`, 409);
  await remove(base);
  await remove(`${base}/permanent`);
  await assert.rejects(
    access(
      join(directory, "private/sessions", session.id, "conversation.sqlite"),
    ),
  );
  const next = await post("/v1/sessions", { requestId: "next" });
  assert.notEqual(next.name, session.name);
  await remove(`/v1/workspaces/${project.id}`);
  await remove(`/v1/workspaces/${project.id}/permanent`);
  await access(join(project.path, "keep.txt"));
  await app.close();
});

test("permanently deleting project history removes its database without touching machine credentials", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-purge-legacy-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let app = createApp({}, { dataDirectory: directory, models: () => models });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: { requestId: "project" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  const projectId = created.json().workspaceId;
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `/v1/sessions/${id}`,
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `/v1/sessions/${id}/permanent`,
        headers,
      })
    ).statusCode,
    204,
  );
  await assert.rejects(
    access(join(directory, "sessions", id, "conversation.sqlite")),
  );
  await access(join(directory, "credentials.sqlite"));
  await access(join(directory, "catalog.sqlite"));
  await app.close();
  app = createApp({}, { dataDirectory: directory, models: () => models });
  assert.deepEqual((await app.inject("/v1/sessions")).json(), []);
  assert.equal((await app.inject("/v1/providers")).statusCode, 200);
  assert.ok(
    (await app.inject("/v1/workspaces"))
      .json()
      .some((item: { id: string }) => item.id === projectId),
  );
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { createApp } from "../src/app.ts";

const headers = { "x-console-request": "1" };
test("Default persists and binds conversations to their project working directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-default-project-"));
  const data = join(root, "private");
  const models = createModels();
  let app = createApp({}, { dataDirectory: data, models: () => models });
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  const projects = (await app.inject("/v1/workspaces")).json();
  assert.equal(projects.length, 1);
  const project = projects[0];
  assert.equal(project.name, "Default");
  assert.equal(project.isDefault, 1);
  assert.ok(relative(data, project.path).startsWith(".."));
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: { requestId: "first" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const conversation = created.json();
  assert.equal(conversation.workspaceId, project.id);
  assert.equal(conversation.workspace, project.path);
  assert.equal("sandbox" in conversation, false);
  const base = `/v1/sessions/${conversation.id}`;
  const deleted = await app.inject({
    method: "DELETE",
    url: `/v1/workspaces/${project.id}`,
    headers,
  });
  assert.equal(deleted.statusCode, 409);
  assert.equal((await app.inject(base)).statusCode, 200);
  const roots = (await app.inject(`${base}/conversations`)).json();
  assert.equal(
    roots.filter((item: { isMain: boolean }) => item.isMain).length,
    1,
  );
  await app.close();
  app = createApp({}, { dataDirectory: data, models: () => models });
  const restored = (await app.inject(base)).json();
  assert.equal(restored.workspaceId, project.id);
  assert.equal(restored.workspace, project.path);
  assert.equal((await app.inject("/v1/workspaces")).json().length, 1);
  const next = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: { requestId: "next" },
  });
  assert.equal(next.json().workspaceId, project.id);
  assert.equal(next.json().workspace, project.path);
});

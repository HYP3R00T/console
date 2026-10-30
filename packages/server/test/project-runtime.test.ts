import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { Harness } from "@earendil-works/pi-durable";
import { createApp } from "../src/app.ts";

const headers = { "x-console-request": "1" };
test("projects reuse one Harness across conversations, share explicit memory and isolate other projects across reopen", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-project-runtime-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let opened = 0;
  const original = Harness.open;
  t.mock.method(Harness, "open", (...args: Parameters<typeof original>) => {
    opened++;
    return original(...args);
  });
  let app = createApp(
    {},
    { dataDirectory: join(root, "data"), models: () => models },
  );
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  async function post(url: string, payload: Record<string, unknown>) {
    const response = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  }
  const projects: string[] = [];
  for (const name of ["Alpha", "Beta"]) {
    const path = join(root, name);
    await mkdir(path);
    projects.push(
      (await post("/v1/workspaces", { name, path, requestId: name })).id,
    );
  }
  const path = `/v1/workspaces/${projects[0]}`;
  const first = await post(`${path}/conversations`, { requestId: "first" });
  const [retry, second] = await Promise.all([
    post(`${path}/conversations`, { requestId: "first" }),
    post(`${path}/conversations`, { requestId: "second" }),
  ]);
  assert.equal(first.id, retry.id);
  assert.equal(first.conversationId, retry.conversationId);
  assert.equal(first.id, second.id);
  assert.notEqual(first.conversationId, second.conversationId);
  assert.equal(opened, 1);
  assert.equal(
    (await app.inject(`/v1/sessions/${first.id}/conversations`)).json().length,
    2,
  );
  assert.equal((await app.inject("/v1/sessions")).json().length, 1);
  const remembered = await app.inject({
    method: "PUT",
    url: `${path}/memory`,
    headers,
    payload: { value: { fact: "shared project fact" }, revision: 0 },
  });
  assert.equal(remembered.statusCode, 200, remembered.body);
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `${path}/memory`,
        headers,
        payload: { value: { fact: "stale replacement" }, revision: 0 },
      })
    ).statusCode,
    409,
  );
  const otherPath = `/v1/workspaces/${projects[1]}`;
  assert.deepEqual((await app.inject(`${otherPath}/memory`)).json(), {
    revision: 0,
    value: {},
  });
  const base = `/v1/sessions/${first.id}/conversations/${second.conversationId}`;
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/config`,
        headers,
        payload: { provider: faux.provider.id, model: faux.getModel().id },
      })
    ).statusCode,
    200,
  );
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_state", {}), {
      stopReason: "toolUse",
    }),
    (context) => {
      assert.match(
        JSON.stringify(context.messages.at(-1)),
        /shared project fact/,
      );
      return fauxAssistantMessage(
        fauxToolCall("update_state", {
          revision: 1,
          value_json: JSON.stringify({ fact: "updated by conversation" }),
        }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage("Shared memory updated"),
  ]);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${base}/messages`,
        headers,
        payload: {
          text: "Read and update project memory",
          requestId: "memory-task",
        },
      })
    ).statusCode,
    202,
  );
  let complete = false;
  for (let n = 0; n < 300; n++) {
    const view = (await app.inject(base)).json();
    if (view.messages.at(-1)?.text === "Shared memory updated") {
      complete = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(complete, "native memory tools should finish");
  assert.deepEqual(
    (
      await app.inject(
        `/v1/sessions/${first.id}/conversations/${first.conversationId}`,
      )
    ).json().messages,
    [],
  );
  assert.deepEqual((await app.inject(`${path}/memory`)).json(), {
    revision: 2,
    value: { fact: "updated by conversation" },
  });
  await app.close();
  app = createApp(
    {},
    { dataDirectory: join(root, "data"), models: () => models },
  );
  const third = await post(`${path}/conversations`, { requestId: "third" });
  assert.equal(third.id, first.id);
  assert.deepEqual(third.messages, []);
  assert.deepEqual((await app.inject(`${path}/memory`)).json(), {
    revision: 2,
    value: { fact: "updated by conversation" },
  });
  assert.deepEqual((await app.inject(`${otherPath}/memory`)).json(), {
    revision: 0,
    value: {},
  });
});

test("project memory tool receipts survive reopening and reject a different stale write", async (t) => {
  const { BACKGROUND_CONTEXT: context } = await import(
    "@earendil-works/chord/context"
  );
  const { createRegistry } = await import("@earendil-works/pi-durable");
  const { openNodeSqliteStorage } = await import(
    "@earendil-works/pi-durable/storage/sqlite/node"
  );
  const { readProjectMemory, saveProjectMemory } = await import(
    "../src/runtime/coordination.ts"
  );
  const directory = await mkdtemp(join(tmpdir(), "console-memory-receipt-"));
  const path = join(directory, "conversation.sqlite");
  const options = { models: createModels(), registry: createRegistry() };
  let harness = await Harness.open(
    await openNodeSqliteStorage(path),
    options,
    context,
  );
  t.after(async () => {
    await harness.close(context);
    await rm(directory, { recursive: true, force: true });
  });
  const first = await harness.root(context);
  const saved = await first.commit(
    (tx) => saveProjectMemory(tx, { fact: "once" }, 0, "tool:1"),
    context,
  );
  await harness.close(context);
  harness = await Harness.open(
    await openNodeSqliteStorage(path),
    options,
    context,
  );
  const reopened = await harness.root(context);
  assert.deepEqual(
    await reopened.commit(
      (tx) => saveProjectMemory(tx, { fact: "must not replace" }, 0, "tool:1"),
      context,
    ),
    saved,
  );
  await assert.rejects(
    reopened.commit(
      (tx) => saveProjectMemory(tx, { fact: "stale" }, 0, "tool:2"),
      context,
    ),
    /Memory changed/,
  );
  assert.deepEqual(await reopened.commit(readProjectMemory, context), {
    revision: 1,
    value: { fact: "once" },
  });
});

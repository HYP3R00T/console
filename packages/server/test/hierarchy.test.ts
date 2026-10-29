import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";

const headers = { "x-console-request": "1" };
async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let n = 0; n < 300; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((accept) => setTimeout(accept, 10));
  }
  throw new Error("Expected state did not arrive");
}

test("remote hub keeps tokens private and persists backend → project → session → conversations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-hierarchy-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let peer = createApp(
    {},
    {
      dataDirectory: join(root, "peer"),
      machineName: "Remote test",
      accessToken: "test-remote-secret",
      models: () => models,
    },
  );
  const address = await peer.listen({ host: "127.0.0.1", port: 0 });
  let hub = createApp(
    {},
    { dataDirectory: join(root, "hub"), accessToken: "", models: () => models },
  );
  t.after(async () => {
    await hub.close();
    await peer.close();
    await rm(root, { recursive: true });
  });
  assert.equal((await peer.inject("/v1/machines")).statusCode, 401);
  const bad = await hub.inject({
    method: "POST",
    url: "/v1/backends",
    headers,
    payload: { name: "Peer", url: address, token: "wrong" },
  });
  assert.equal(bad.statusCode, 400);
  assert.equal((await hub.inject("/v1/backends")).json().length, 1);
  const connection = await hub.inject({
    method: "POST",
    url: "/v1/backends",
    headers,
    payload: { name: "Peer", url: address, token: "test-remote-secret" },
  });
  assert.equal(connection.statusCode, 201, connection.body);
  assert.doesNotMatch(connection.body, /test-remote-secret|"token"/);
  const backendId = connection.json().id;
  const prefix = `/v1/backends/${backendId}/api`;
  assert.doesNotMatch(
    (await hub.inject("/v1/backends")).body,
    /test-remote-secret|"token"/,
  );
  const remoteState = await hub.inject({
    method: "PUT",
    url: `${prefix}/state`,
    headers,
    payload: { value: { machine: "peer" }, revision: 0 },
  });
  assert.equal(remoteState.statusCode, 200, remoteState.body);
  assert.deepEqual((await hub.inject(`${prefix}/state`)).json().value, {
    machine: "peer",
  });
  assert.deepEqual((await hub.inject("/v1/state")).json().value, {});
  const workspace = await hub.inject({
    method: "POST",
    url: `${prefix}/workspaces`,
    headers,
    payload: {
      name: "Project",
      path: join(root, "project"),
      createDirectory: true,
      requestId: "project",
    },
  });
  assert.equal(workspace.statusCode, 201, workspace.body);
  const repeated = await hub.inject({
    method: "POST",
    url: `${prefix}/workspaces`,
    headers,
    payload: {
      name: "Project",
      path: join(root, "project"),
      createDirectory: true,
      requestId: "project",
    },
  });
  assert.equal(repeated.json().id, workspace.json().id);
  const workspaceId = workspace.json().id;
  const session = await hub.inject({
    method: "POST",
    url: `${prefix}/sessions`,
    headers,
    payload: { name: "Build", workspaceId, requestId: "session" },
  });
  assert.equal(session.statusCode, 201, session.body);
  assert.equal(session.json().workspaceId, workspaceId);
  assert.equal(session.json().workspace, join(root, "project"));
  const id = session.json().id;
  assert.equal(
    (
      await hub.inject({
        method: "PATCH",
        url: `${prefix}/sessions/${id}/sandbox`,
        headers,
        payload: {
          enabled: false,
          workspace: join(root, "other"),
          readPaths: [],
          writePaths: [],
          network: "blocked",
        },
      })
    ).statusCode,
    400,
  );
  const base = `${prefix}/sessions/${id}`;
  assert.equal(
    (
      await hub.inject({
        method: "PATCH",
        url: `${base}/config`,
        headers,
        payload: { provider: faux.provider.id, model: faux.getModel().id },
      })
    ).statusCode,
    200,
  );
  const create = {
    method: "POST" as const,
    url: `${base}/conversations`,
    headers,
    payload: { name: "Research", requestId: "research" },
  };
  const results = await Promise.all([hub.inject(create), hub.inject(create)]);
  assert.equal(results[0].statusCode, 201, results[0].body);
  assert.equal(results[0].json().id, results[1].json().id);
  const cid = results[0].json().id;
  const conversation = `${base}/conversations/${cid}`;
  faux.setResponses([fauxAssistantMessage("Research result")]);
  assert.equal(
    (
      await hub.inject({
        method: "POST",
        url: `${conversation}/messages`,
        headers,
        payload: { text: "Research", requestId: "research-message" },
      })
    ).statusCode,
    202,
  );
  await until(
    async () => (await hub.inject(conversation)).json(),
    (value) => value.messages.at(-1)?.text === "Research result",
  );
  assert.equal((await hub.inject(base)).json().messages.length, 0);
  assert.equal(
    (
      await hub.inject({
        method: "PATCH",
        url: conversation,
        headers,
        payload: { name: "Findings" },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await hub.inject({
        method: "PATCH",
        url: base,
        headers,
        payload: { name: "Renamed session" },
      })
    ).statusCode,
    200,
  );
  assert.equal((await hub.inject(`${base}/conversations`)).json().length, 2);
  assert.equal(
    (await hub.inject(`${base}/conversations/99999`)).statusCode,
    404,
  );
  await hub.close();
  await peer.close();
  peer = createApp(
    {},
    {
      dataDirectory: join(root, "peer"),
      machineName: "Remote test",
      accessToken: "test-remote-secret",
      models: () => models,
    },
  );
  await peer.listen({ host: "127.0.0.1", port: Number(new URL(address).port) });
  hub = createApp(
    {},
    { dataDirectory: join(root, "hub"), accessToken: "", models: () => models },
  );
  assert.equal(
    (await hub.inject(`${conversation}`)).json().messages.at(-1).text,
    "Research result",
  );
  assert.equal(
    (await hub.inject(`${base}/conversations`))
      .json()
      .find((item: { id: string }) => item.id === cid).name,
    "Findings",
  );
  assert.equal((await hub.inject(`${base}`)).json().name, "Renamed session");
  assert.equal((await hub.inject("/v1/sessions")).json().length, 0);
  assert.equal(
    (await hub.inject(`${prefix}/workspaces`))
      .json()
      .find((item: { id: string }) => item.id === workspaceId)?.id,
    workspaceId,
  );
  await assert.rejects(
    readFile(join(root, "hub", "sessions", id, "conversation.sqlite")),
  );
  assert.equal(
    (
      await hub.inject({
        method: "DELETE",
        url: `/v1/backends/${backendId}`,
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal((await hub.inject(`${prefix}/sessions`)).statusCode, 404);
  assert.equal(
    (
      await peer.inject({
        url: `/v1/sessions/${id}`,
        headers: { authorization: "Bearer test-remote-secret" },
      })
    ).statusCode,
    200,
  );
});

test("backend connections reject insecure origins, redirects, and unauthenticated remote callers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-remote-guard-"));
  const app = createApp({}, { dataDirectory: root, accessToken: "" });
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true });
  });
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "file:///tmp/data",
  ]) {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/backends",
          headers,
          payload: { name: "Invalid", url, token: "test" },
        })
      ).statusCode,
      400,
    );
  }
  assert.equal(
    (await app.inject({ url: "/v1/backends", remoteAddress: "192.0.2.1" }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/backends",
        payload: {
          name: "No header",
          url: "https://example.com",
          token: "test",
        },
      })
    ).statusCode,
    403,
  );
  let requests = 0;
  const redirect = createServer((_req, reply) => {
    ++requests;
    reply.writeHead(302, { location: "/v1/machines?redirected=1" });
    reply.end();
  });
  await new Promise<void>((accept) => redirect.listen(0, "127.0.0.1", accept));
  t.after(() => new Promise<void>((accept) => redirect.close(() => accept())));
  const address = redirect.address();
  assert.ok(address && typeof address !== "string");
  const result = await app.inject({
    method: "POST",
    url: "/v1/backends",
    headers,
    payload: {
      name: "Redirect",
      url: `http://127.0.0.1:${address.port}`,
      token: "test",
    },
  });
  assert.equal(result.statusCode, 502);
  assert.equal(requests, 1);
});

test("conversation work is independent and interrupted sessions require explicit resume", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-conversations-"));
  const faux = fauxProvider({
    tokensPerSecond: 40,
    tokenSize: { min: 1, max: 1 },
  });
  const models = createModels();
  models.setProvider(faux.provider);
  let app = createApp(
    {},
    { dataDirectory: root, accessToken: "", models: () => models },
  );
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true });
  });
  const id = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { name: "Concurrent", requestId: "concurrent" },
    })
  ).json().id;
  const base = `/v1/sessions/${id}`;
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  const child = (
    await app.inject({
      method: "POST",
      url: `${base}/conversations`,
      headers,
      payload: { name: "Child", requestId: "child" },
    })
  ).json();
  const path = `${base}/conversations/${child.id}`;
  faux.setResponses([
    fauxAssistantMessage("Long response ".repeat(20)),
    fauxAssistantMessage("Short"),
  ]);
  await app.inject({
    method: "POST",
    url: `${base}/messages`,
    headers,
    payload: { text: "Long", requestId: "long" },
  });
  await until(
    async () => (await app.inject(base)).json(),
    (value) => value.partial.length > 0,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${path}/messages`,
        headers,
        payload: { text: "Short", requestId: "short" },
      })
    ).statusCode,
    202,
  );
  await until(
    async () => (await app.inject(path)).json(),
    (value) =>
      value.status === "idle" && value.messages.at(-1)?.text === "Short",
  );
  assert.equal((await app.inject(base)).json().status, "running");
  assert.equal((await app.inject("/v1/sessions")).json()[0].status, "running");
  await app.close();
  app = createApp(
    {},
    { dataDirectory: root, accessToken: "", models: () => models },
  );
  assert.equal(
    (await app.inject("/v1/sessions")).json()[0].status,
    "interrupted",
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${path}/messages`,
        headers,
        payload: {
          text: "Do not resume main implicitly",
          requestId: "blocked",
        },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: `${base}/cancel`, headers }))
      .statusCode,
    204,
  );
  assert.equal((await app.inject(path)).json().status, "idle");
  assert.equal((await app.inject(path)).json().messages.at(-1).text, "Short");
});

import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { api } from "../../web/src/lib/console-api.ts";
import { openMachineStore } from "../../web/src/lib/machine-store.ts";
import { createApp } from "../src/app.ts";

test("web connections start empty, authenticate explicitly, persist and disconnect without touching machine data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-connect-"));
  const app = createApp(
    {},
    {
      dataDirectory: join(directory, "machine"),
      machineName: "Fixture machine",
      accessToken: "fixture-connection-secret",
      models: () => createModels(),
    },
  );
  let requests = 0;
  app.addHook("onRequest", async () => {
    requests++;
  });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  const path = join(directory, "web/connections.sqlite");
  let store = openMachineStore(path);
  t.after(async () => {
    await store.close();
    await app.close();
    await rm(directory, { recursive: true });
  });
  assert.deepEqual(store.list(), []);
  assert.equal(requests, 0);
  await assert.rejects(api("/machines"), /Connect a machine/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await assert.rejects(store.connect({ url }), /authentication failed/);
  assert.deepEqual(store.list(), []);
  const connected = await store.connect({
    url,
    token: "fixture-connection-secret",
  });
  assert.equal(connected.name, "Fixture machine");
  assert.equal(connected.apiVersion, 1);
  assert.doesNotMatch(
    JSON.stringify(connected),
    /fixture-connection-secret|"token"/,
  );
  const before = requests;
  store.list();
  assert.equal(requests, before);
  const project = await store.proxy(connected.id, "workspaces", "POST", {
    name: "Kept project",
    path: join(directory, "project"),
    createDirectory: true,
    requestId: "project",
  });
  assert.equal(project.status, 201);
  const renamed = await store.connect({
    url,
    token: "fixture-connection-secret",
    name: "Laptop",
  });
  assert.equal(renamed.id, connected.id);
  await store.close();
  store = openMachineStore(path);
  assert.equal(store.list()[0]?.name, "Laptop");
  assert.equal(store.list()[0]?.status, "unknown");
  assert.equal(
    (await store.proxy(connected.id, "workspaces", "GET")).data.length,
    1,
  );
  assert.throws(
    () => store.proxy(connected.id, "backends", "GET"),
    /Unsupported/,
  );
  await store.disconnect(connected.id);
  assert.equal(store.recent()[0]?.id, connected.id);
  assert.doesNotMatch(
    JSON.stringify(store.recent()),
    /fixture-connection-secret|"token"/,
  );
  assert.deepEqual(store.list(), []);
  await assert.rejects(
    Promise.resolve().then(() =>
      store.proxy(connected.id, "workspaces", "GET"),
    ),
    /not connected/,
  );
  assert.equal(
    (
      await app.inject({
        url: "/v1/workspaces",
        headers: { authorization: "Bearer fixture-connection-secret" },
      })
    ).json().length,
    1,
  );
  await assert.rejects(
    store.reconnect(connected.id),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 401,
  );
  assert.deepEqual(store.list(), []);
  assert.equal(store.recent()[0]?.id, connected.id);
  const reconnect = await store.reconnect(
    connected.id,
    "fixture-connection-secret",
  );
  assert.equal(reconnect.id, connected.id);
  await app.close();
  await assert.rejects(store.check(reconnect.id), /Cannot reach/);
  assert.equal(store.list()[0]?.status, "offline");
});

test("onboarding rejects incompatible servers, redirects and unsafe origins before saving credentials", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-protocol-"));
  const store = openMachineStore(join(directory, "connections.sqlite"));
  let compatible = false;
  let redirect = false;
  let redirectedRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect-target") {
      redirectedRequests++;
      res.end("unexpected");
      return;
    }
    if (redirect) {
      res.writeHead(307, { location: "/redirect-target" });
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        product: "console",
        apiVersion: compatible ? 1 : 2,
        machine: { id: "fixture", name: "Fixture" },
      }),
    );
  });
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await store.close();
    await new Promise<void>((accept, reject) =>
      server.close((error) => (error ? reject(error) : accept())),
    );
    await rm(directory, { recursive: true });
  });
  await assert.rejects(store.connect({ url }), /compatible Console backend/);
  assert.deepEqual(store.list(), []);
  for (const bad of [
    "http://192.0.2.1:3000",
    `${url}/v1`,
    `${url}?token=x`,
    `http://user:secret@127.0.0.1:${address.port}`,
  ])
    await assert.rejects(store.connect({ url: bad }), /HTTPS|origin/);
  await assert.rejects(
    store.connect({ url: "https://example.invalid" }),
    /access token/,
  );
  compatible = true;
  const saved = await store.connect({ url });
  assert.equal(saved.machineId, "fixture");
  redirect = true;
  await assert.rejects(
    store.connect({ url, token: "do-not-forward-fixture" }),
    /Cannot reach/,
  );
  assert.equal(redirectedRequests, 0);
  assert.equal(store.list().length, 1);
});

test("managed SSH transport closes on disconnect, retains history without credentials and reconnects explicitly", async (t) => {
  const { sshArguments } = await import("../../web/src/lib/ssh-tunnel.ts");
  const directory = await mkdtemp(join(tmpdir(), "console-ssh-"));
  const app = createApp(
    {},
    { dataDirectory: join(directory, "machine"), models: () => createModels() },
  );
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  let opened = 0;
  let closed = 0;
  const store = openMachineStore(
    join(directory, "connections.sqlite"),
    async () => {
      opened++;
      return {
        url,
        close: async () => {
          closed++;
        },
      };
    },
  );
  t.after(async () => {
    await store.close();
    await app.close();
    await rm(directory, { recursive: true });
  });
  const ssh = { host: "fixture-alias", port: 22, backendPort: 3000 };
  const args = sshArguments(ssh, 12345);
  assert.ok(args.includes("StrictHostKeyChecking=yes"));
  assert.ok(args.includes("BatchMode=yes"));
  assert.ok(args.includes("127.0.0.1:12345:127.0.0.1:3000"));
  assert.throws(() =>
    sshArguments({ ...ssh, host: "-oProxyCommand=bad" }, 12345),
  );
  assert.throws(() =>
    sshArguments({ ...ssh, host: "host; touch /tmp/bad" }, 12345),
  );
  assert.throws(() => sshArguments({ ...ssh, backendPort: 0 }, 12345));
  const saved = await store.connect({ url: "http://127.0.0.1", ssh });
  assert.equal(opened, 1);
  await store.check(saved.id);
  assert.equal(opened, 1);
  await store.disconnect(saved.id);
  assert.equal(closed, 1);
  assert.equal(store.recent()[0]?.ssh?.host, ssh.host);
  assert.equal(store.list().length, 0);
  const restored = await store.reconnect(saved.id);
  assert.equal(restored.id, saved.id);
  assert.equal(opened, 2);
  assert.throws(() => store.forget(saved.id), /Disconnect/);
  await store.disconnect(saved.id);
  store.forget(saved.id);
  assert.equal(store.recent().length, 0);
  assert.equal(closed, 2);
  const prefs = { models: ["fixture/model"], thinkingLevels: ["off", "high"] };
  store.savePreferences(prefs);
  assert.deepEqual(store.preferences(), prefs);
  assert.throws(
    () => store.savePreferences({ ...prefs, thinkingLevels: [] }),
    /valid models/,
  );
});

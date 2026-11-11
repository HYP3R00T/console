import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseHttpConfiguration } from "../src/access/configuration.ts";
import { AccessService } from "../src/access/service.ts";
import { createApp } from "../src/app.ts";

test("remote authentication pairs once, rejects expired invitations, persists only hashes and revokes API and SSE access", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-access-"));
  const path = join(directory, "access.sqlite");
  let access = new AccessService(path);
  const invite = access.invite();
  assert.equal(access.pair(access.invite(0).code, "expired"), undefined);
  const client = access.pair(invite.code, "Test browser");
  assert.ok(client);
  assert.equal(access.pair(invite.code, "another"), undefined);
  assert.ok(
    !JSON.stringify(
      access.db.prepare("SELECT * FROM access_clients").all(),
    ).includes(client.token),
  );
  access.close();
  access = new AccessService(path);
  assert.ok(access.client(client.token));
  const app = createApp({}, undefined, undefined, undefined, {
    origins: ["https://console.example"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    authorize: access.authorize,
  });
  access.register(app);
  app.get("/v1/test/events", async (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream" });
    reply.raw.write("event: snapshot\ndata: ready\n\n");
  });
  t.after(async () => {
    access.close();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const headers = { authorization: `Bearer ${client.token}` };
  assert.equal((await app.inject("/v1/connection")).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        url: "/v1/test/events",
        headers: { authorization: "Bearer invalid" },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ url: "/v1/connection", headers })).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/v1/connection",
        headers: { ...headers, origin: "https://attacker.example" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "OPTIONS",
        url: "/v1/access/pair",
        headers: {
          origin: "https://console.example",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      })
    ).statusCode,
    204,
  );
  const paired = await app.inject({
    method: "POST",
    url: "/v1/access/pair",
    payload: { code: access.invite().code, name: "New client" },
  });
  assert.equal(paired.statusCode, 200, paired.body);
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  const response = await fetch(`${origin}/v1/test/events`, {
    headers,
    signal: AbortSignal.timeout(4000),
  });
  assert.equal(response.status, 200);
  const reader = response.body?.getReader();
  assert.ok(reader);
  assert.ok(
    new TextDecoder().decode((await reader.read()).value).includes("ready"),
  );
  const cli = new AccessService(path);
  cli.revoke(client.id);
  cli.close();
  await assert.rejects(reader.read());
  assert.equal(
    (await app.inject({ url: "/v1/connection", headers })).statusCode,
    401,
  );
});

test("pairing throttles guesses and remote configuration requires authentication and explicit safe origins", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-pairing-"));
  const access = new AccessService(join(directory, "access.sqlite"));
  const app = createApp({}, undefined, undefined, undefined, {
    origins: ["http://localhost:3001"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    authorize: access.authorize,
  });
  access.register(app);
  t.after(async () => {
    await app.close();
    access.close();
    await rm(directory, { recursive: true, force: true });
  });
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/access/pair",
          payload: { code: "x".repeat(32), name: "guess" },
        })
      ).statusCode,
      401,
    );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/access/pair",
        payload: { code: access.invite().code, name: "client" },
      })
    ).statusCode,
    429,
  );
  const config = {
    host: "0.0.0.0",
    port: 3000,
    origins: ["https://console.example"],
    authentication: true,
  };
  assert.deepEqual(parseHttpConfiguration(config), config);
  assert.throws(() =>
    parseHttpConfiguration({ ...config, authentication: false }),
  );
  assert.throws(() =>
    parseHttpConfiguration({ ...config, origins: ["http://console.example"] }),
  );
  assert.throws(() =>
    parseHttpConfiguration({
      ...config,
      origins: ["https://console.example/path"],
    }),
  );
});

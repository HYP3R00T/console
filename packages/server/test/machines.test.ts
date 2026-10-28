import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import { resolveConfiguration } from "../src/configuration.ts";

test("startup configuration validates storage and keeps source precedence explicit", () => {
  assert.throws(
    () => resolveConfiguration({ dataDirectory: "relative/path" }),
    /absolute/,
  );
  assert.throws(() => resolveConfiguration({ dataDirectory: "" }), /absolute/);
  assert.throws(
    () =>
      resolveConfiguration({ dataDirectory: "/tmp/data", machineName: " " }),
    /Machine name/,
  );
  const config = resolveConfiguration({
    dataDirectory: "/tmp/data/../console",
    machineName: "My machine",
  });
  assert.equal(config.directory, "/tmp/console");
  assert.equal(config.machineName, "My machine");
  assert.equal(config.storageSource, "application");
});

test("machine dashboard reports real storage, persistent identity, and session counts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-machine-"));
  const models = createModels();
  models.setProvider(fauxProvider().provider);
  const options = {
    dataDirectory: directory,
    machineName: "Test laptop",
    models: () => models,
  };
  let app = createApp({}, options);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const machines = (await app.inject("/v1/machines")).json();
  assert.equal(machines.length, 1);
  const machine = machines[0];
  assert.equal(machine.name, "Test laptop");
  assert.equal(machine.local, true);
  assert.equal(machine.sessions, 0);
  assert.equal(machine.activeSessions, 0);
  assert.equal(machine.storage.directory, directory);
  assert.equal(machine.storage.catalog, join(directory, "catalog.sqlite"));
  assert.equal(machine.capabilities.remoteMachines, true);
  assert.equal(machine.capabilities.shell, true);
  assert.equal((await stat(machine.storage.catalog)).isFile(), true);
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers: { "x-console-request": "1" },
    payload: { name: "Test", requestId: "one" },
  });
  const id = created.json().id;
  assert.equal(
    (
      await stat(join(machine.storage.sessions, id, "conversation.sqlite"))
    ).isFile(),
    true,
  );
  await app.close();
  app = createApp({}, options);
  const restored = (await app.inject("/v1/machines")).json()[0];
  assert.equal(restored.id, machine.id);
  assert.equal(restored.sessions, 1);
  assert.equal(restored.unavailableSessions, 0);
  assert.equal((await app.inject(`/v1/sessions/${id}`)).json().name, "Test");
});

test("conversation catalogs exclude disconnected providers and reject selecting them", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-connected-"));
  const models = createModels();
  const connected = fauxProvider({ provider: "connected" });
  const disconnected = fauxProvider({ provider: "disconnected" });
  models.setProvider(connected.provider);
  models.setProvider({
    ...disconnected.provider,
    auth: { apiKey: { name: "Missing key", resolve: async () => undefined } },
  });
  const app = createApp({}, { dataDirectory: directory, models: () => models });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  assert.equal((await app.inject("/v1/providers")).json().length, 2);
  const available = (await app.inject("/v1/providers?connected=true")).json();
  assert.deepEqual(
    available.map((item: { id: string }) => item.id),
    ["connected"],
  );
  const headers = { "x-console-request": "1" };
  const id = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { name: "Test", requestId: "test" },
    })
  ).json().id;
  const result = await app.inject({
    method: "PATCH",
    url: `/v1/sessions/${id}/config`,
    headers,
    payload: { provider: "disconnected", model: disconnected.getModel().id },
  });
  assert.equal(result.statusCode, 400);
  assert.equal(
    (await app.inject(`/v1/sessions/${id}`)).json().model,
    undefined,
  );
});

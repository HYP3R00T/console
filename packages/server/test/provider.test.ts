import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import { openCredentials } from "../src/models/credentials.ts";
import { createProviders } from "../src/models/providers.ts";

async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected state did not arrive");
}

test("credentials survive reopen, serialize refresh, and lock out a second owner", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-credentials-"));
  t.after(() => rm(directory, { recursive: true }));
  const first = await openCredentials(directory);
  try {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal(
      (await stat(join(directory, "credentials.sqlite"))).mode & 0o777,
      0o600,
    );
    await assert.rejects(openCredentials(directory), /locked/);
    await first.store.modify("test", async () => ({
      type: "api_key",
      key: "0",
    }));
    await Promise.all(
      [1, 2].map(() =>
        first.store.modify("test", async (current) => {
          assert.equal(current?.type, "api_key");
          return {
            type: "api_key",
            key: String(
              Number(current?.type === "api_key" ? current.key : "0") + 1,
            ),
          };
        }),
      ),
    );
    assert.deepEqual(await first.store.list(), [
      { providerId: "test", type: "api_key" },
    ]);
  } finally {
    await first.close();
  }
  const second = await openCredentials(directory);
  try {
    assert.equal(second.deviceId, first.deviceId);
    assert.deepEqual(await second.store.read("test"), {
      type: "api_key",
      key: "2",
    });
    await second.store.delete("test");
    assert.equal(await second.store.read("test"), undefined);
  } finally {
    await second.close();
  }
});

test("OAuth relays URLs, device codes and selection prompts; failures stay generic", async () => {
  const models = createModels();
  models.setProvider({
    ...fauxProvider({ provider: "oauth-test" }).provider,
    auth: {
      oauth: {
        name: "Test subscription",
        isSubscription: true,
        async login(interaction) {
          interaction.notify({
            type: "auth_url",
            url: "https://example.com/authorize",
          });
          interaction.notify({
            type: "device_code",
            verificationUri: "https://example.com/device",
            userCode: "test-code",
          });
          const choice = await interaction.prompt({
            type: "select",
            message: "Choose account",
            options: [{ id: "account", label: "Test account" }],
          });
          assert.equal(choice, "account");
          throw new Error("Sensitive provider failure: must-not-leak");
        },
        refresh: async (credential) => credential,
        toAuth: async () => ({ apiKey: "unused" }),
      },
    },
  });
  const providers = createProviders(models, "test-device", "oauth-test");
  try {
    const flow = providers.start("oauth-test", "oauth");
    await until(
      async () => providers.get(flow.id),
      (value) => Boolean(value.prompt),
    );
    assert.equal(flow.events[0].type, "auth_url");
    assert.equal(flow.events[1].type, "device_code");
    assert.throws(
      () => providers.start("oauth-test", "oauth"),
      /Finish or cancel/,
    );
    assert.throws(
      () => providers.answer(flow.id, flow.prompt?.id ?? "", "wrong"),
      /listed option/,
    );
    providers.answer(flow.id, flow.prompt?.id ?? "", "account");
    await until(
      async () => providers.get(flow.id),
      (value) => value.status === "failed",
    );
    assert.ok(!JSON.stringify(providers.current()).includes("must-not-leak"));
  } finally {
    await providers.close();
  }
});

test("provider HTTP login persists credentials, rejects stale answers and omits secrets", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-mvp-auth-"));
  function build() {
    return createApp(
      {},
      {
        dataDirectory: directory,
        providerId: "test",
        models(store) {
          const models = createModels({ credentials: store });
          models.setProvider({
            ...fauxProvider({ provider: "test" }).provider,
            auth: {
              apiKey: {
                name: "Test key",
                login: async (interaction) => ({
                  type: "api_key",
                  key: await interaction.prompt({
                    type: "secret",
                    message: "Enter key",
                  }),
                }),
                resolve: async ({ credential }) =>
                  credential?.key
                    ? { auth: { apiKey: credential.key }, source: "saved key" }
                    : undefined,
              },
            },
          });
          return models;
        },
      },
    );
  }
  let app = build();
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const headers = { "x-console-request": "1" };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/provider/login",
        payload: { method: "api_key" },
      })
    ).statusCode,
    403,
  );
  const started = await app.inject({
    method: "POST",
    url: "/v1/provider/login",
    headers,
    payload: { method: "api_key" },
  });
  assert.equal(started.statusCode, 202);
  const flow = (await app.inject("/v1/provider/login")).json();
  assert.equal(flow.prompt.type, "secret");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/provider/login/answer",
        headers,
        payload: {
          loginId: flow.id,
          promptId: "stale",
          value: "private-test-key",
        },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/provider/login/answer",
        headers,
        payload: {
          loginId: flow.id,
          promptId: flow.prompt.id,
          value: "private-test-key",
        },
      })
    ).statusCode,
    204,
  );
  await until(
    async () => (await app.inject("/v1/provider/login")).json(),
    (value) => value.status === "connected",
  );
  await app.close();
  app = build();
  const info = await app.inject("/v1/provider");
  assert.equal(info.json().configured, true);
  assert.doesNotMatch(info.body, /private-test-key/);
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/v1/provider/credentials",
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal((await app.inject("/v1/provider")).json().configured, false);
  await app.inject({
    method: "POST",
    url: "/v1/provider/login",
    headers,
    payload: { method: "api_key" },
  });
  await app.inject({ method: "DELETE", url: "/v1/provider/login", headers });
  assert.equal(
    (await app.inject("/v1/provider/login")).json().status,
    "cancelled",
  );
});

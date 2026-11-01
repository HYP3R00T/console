import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { createApp } from "../src/app.ts";
import { ProviderService } from "../src/providers/service.ts";
import { ProviderStore } from "../src/providers/store.ts";

function fixture(path = ":memory:") {
  const store = new ProviderStore(path);
  const models = createModels({
    credentials: store,
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  for (const id of ["one", "two"]) {
    const { provider } = fauxProvider({
      provider: id,
      models: [
        {
          id: "test/model",
          name: "Test model",
          reasoning: true,
          contextWindow: 32000,
          maxTokens: 2000,
        },
      ],
    });
    models.setProvider({
      ...provider,
      name: `Provider ${id}`,
      auth: {
        apiKey: {
          name: "API key",
          login: async (interaction) => ({
            type: "api_key",
            key: await interaction.prompt({
              type: "secret",
              message: "API key",
            }),
          }),
          resolve: async ({ credential }) =>
            credential?.key ? { auth: { apiKey: credential.key } } : undefined,
        },
      },
    });
  }
  const service = new ProviderService(store, models);
  return { store, service, app: createApp({}, service) };
}

test("provider login, disabled favorites, removal and secret redaction", async (t) => {
  const { store, app, service } = fixture();
  t.after(() => app.close());
  const started = await app.inject({
    method: "POST",
    url: "/v1/providers/one/login",
    payload: { type: "api_key" },
  });
  assert.equal(started.statusCode, 200);
  const flow = started.json();
  await setImmediate();
  const prompt = service.login(flow.id).view.prompt;
  assert.ok(prompt);
  const invalid = await app.inject({
    method: "POST",
    url: `/v1/provider-logins/${flow.id}/answer`,
    payload: { promptId: prompt.id, value: "" },
  });
  assert.equal(invalid.statusCode, 400);
  const secret = "test-private-value-do-not-return";
  await app.inject({
    method: "POST",
    url: `/v1/provider-logins/${flow.id}/answer`,
    payload: { promptId: prompt.id, value: secret },
  });
  await service.login(flow.id).task;
  assert.equal(service.login(flow.id).view.state, "complete");
  assert.equal((await store.read("one"))?.type, "api_key");
  const overview = await app.inject("/v1/providers");
  assert.equal(overview.json().activeCount, 1);
  assert.ok(!overview.body.includes(secret));
  assert.ok(!JSON.stringify(service.login(flow.id).view).includes(secret));
  const modelPath = "/v1/providers/one/models/test%2Fmodel/favorite";
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: modelPath,
        payload: { favorite: true },
      })
    ).statusCode,
    200,
  );
  const favorite = await app.inject("/v1/models/favorites");
  assert.equal(favorite.json().models.length, 1);
  assert.equal(favorite.json().models[0].contextWindow, 32000);
  await app.inject({
    method: "PUT",
    url: "/v1/providers/one",
    payload: { enabled: false },
  });
  assert.equal(
    (await app.inject("/v1/models/favorites")).json().models.length,
    0,
  );
  assert.equal(store.favorites("one").length, 1);
  await app.inject({
    method: "PUT",
    url: "/v1/providers/one",
    payload: { enabled: true },
  });
  assert.equal(
    (await app.inject("/v1/models/favorites")).json().models.length,
    1,
  );
  await app.inject({ method: "DELETE", url: "/v1/providers/one" });
  assert.equal(await store.read("one"), undefined);
  assert.equal(store.favorites("one").length, 0);
  assert.equal((await app.inject("/v1/providers")).json().activeCount, 0);
});

test("cancelling/removing a pending login cannot resurrect provider credentials", async (t) => {
  const { service, store, app } = fixture();
  t.after(() => app.close());
  const flow = service.start("one", "api_key");
  await setImmediate();
  assert.throws(() => service.start("one", "api_key"), /already in progress/);
  const removal = service.remove("one");
  assert.throws(() => service.start("one", "api_key"), /update is in progress/);
  await assert.rejects(service.refresh("one"), /update is in progress/);
  await removal;
  assert.equal(service.login(flow.id).view.state, "cancelled");
  assert.equal(await store.read("one"), undefined);
  assert.throws(() => service.answer(flow.id, "stale", "secret"), /closed/);
  const other = service.start("two", "api_key");
  await setImmediate();
  const prompt = service.login(other.id).view.prompt;
  assert.ok(prompt);
  service.answer(other.id, prompt.id, "other-provider-key");
  await service.login(other.id).task;
  assert.equal(await store.read("one"), undefined);
  assert.ok(await store.read("two"));
});

test("private backend storage persists favorites and serializes credential updates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "console-providers-"));
  const path = join(dir, "providers.sqlite");
  let store = new ProviderStore(path);
  try {
    await store.modify("one", async () => ({
      type: "api_key",
      key: "initial",
    }));
    await Promise.all([
      store.modify("one", async (current) => {
        await setImmediate();
        return { ...current, type: "api_key", key: "first" };
      }),
      store.modify("one", async (current) => {
        assert.equal(current?.type, "api_key");
        if (current?.type === "api_key") assert.equal(current.key, "first");
        return { type: "api_key", key: "second" };
      }),
    ]);
    await store.setFavorite("one", "model", true);
    await store.setEnabled("one", false);
    const installation = store.installationId();
    await store.close();
    store = new ProviderStore(path);
    assert.equal(store.installationId(), installation);
    assert.equal(store.enabled("one"), false);
    assert.deepEqual(store.favorites(), [{ provider: "one", model: "model" }]);
    assert.deepEqual(await store.read("one"), {
      type: "api_key",
      key: "second",
    });
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("provider mutations validate input and reject unapproved origins", async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/providers/one/login",
        payload: { type: "unknown" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/providers/nope/login",
        payload: { type: "api_key" },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/v1/providers/one",
        payload: { enabled: true },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/v1/providers/one",
        headers: { origin: "https://evil.example" },
      })
    ).statusCode,
    403,
  );
  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/v1/providers/one/login",
    headers: {
      origin: "http://127.0.0.1:3001",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.match(
    String(preflight.headers["access-control-allow-methods"]),
    /POST/,
  );
});

test("OAuth notification/prompt flow persists tokens without exposing them", async (t) => {
  const store = new ProviderStore();
  const models = createModels({ credentials: store });
  const { provider } = fauxProvider({ provider: "oauth-test" });
  models.setProvider({
    ...provider,
    auth: {
      oauth: {
        name: "Subscription",
        login: async (interaction) => {
          interaction.notify({
            type: "auth_url",
            url: "https://example.com/sign-in",
          });
          const code = await interaction.prompt({
            type: "manual_code",
            message: "Paste callback code",
          });
          if (code !== "approved")
            throw new Error(
              "Sensitive upstream error that must not be returned",
            );
          return {
            type: "oauth",
            access: "private-access-token",
            refresh: "private-refresh-token",
            expires: Date.now() + 3600000,
          };
        },
        refresh: async (credential) => credential,
        toAuth: async (credential) => ({ apiKey: credential.access }),
      },
    },
  });
  const service = new ProviderService(store, models);
  t.after(() => service.close());
  const flow = service.start("oauth-test", "oauth");
  await setImmediate();
  const prompt = service.login(flow.id).view.prompt;
  assert.ok(prompt);
  assert.equal(flow.events[0]?.type, "auth_url");
  service.answer(flow.id, prompt.id, "approved");
  await service.login(flow.id).task;
  assert.equal(flow.state, "complete");
  assert.equal((await service.overview()).activeCount, 1);
  const safe = JSON.stringify({ overview: await service.overview(), flow });
  assert.ok(!safe.includes("private-access-token"));
  assert.ok(!safe.includes("private-refresh-token"));
  await service.remove("oauth-test");
  assert.equal(await store.read("oauth-test"), undefined);
});

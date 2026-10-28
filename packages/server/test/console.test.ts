import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import { openConversation } from "../src/conversation.ts";
import { openCredentials } from "../src/credentials.ts";
import { createProviders } from "../src/providers.ts";

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

test("provider routes relay prompts, protect writes, omit secrets, and cancel safely", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-providers-"));
  const app = createApp(
    {},
    {
      dataDirectory: directory,
      models(store) {
        const models = createModels({ credentials: store });
        models.setProvider({
          ...fauxProvider({ provider: "test" }).provider,
          name: "Test",
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
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const headers = { "x-console-request": "1" };
  const payload = { provider: "test", method: "api_key" };
  assert.equal(
    (await app.inject({ method: "POST", url: "/v1/connections", payload }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/connections",
        headers,
        payload: { provider: "missing", method: "oauth" },
      })
    ).statusCode,
    400,
  );
  const response = await app.inject({
    method: "POST",
    url: "/v1/connections",
    headers,
    payload,
  });
  assert.equal(response.statusCode, 202);
  const login = response.json();
  const active = (await app.inject(`/v1/connections/${login.id}`)).json();
  assert.equal(active.prompt.type, "secret");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/connections/${login.id}/answer`,
        headers,
        payload: { promptId: "stale", value: "secret-value" },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/connections/${login.id}/answer`,
        headers,
        payload: { promptId: active.prompt.id, value: "secret-value" },
      })
    ).statusCode,
    204,
  );
  await until(
    async () => (await app.inject(`/v1/connections/${login.id}`)).json(),
    (value) => value.status === "connected",
  );
  const providers = await app.inject("/v1/providers");
  assert.equal(providers.json()[0].configured, true);
  assert.ok(!providers.body.includes("secret-value"));
  assert.equal(providers.headers["cache-control"], "no-store");
  await app.inject({ method: "DELETE", url: "/v1/providers/test", headers });
  assert.equal((await app.inject("/v1/providers")).json()[0].configured, false);
  const pending = (
    await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers,
      payload,
    })
  ).json();
  await app.inject({
    method: "DELETE",
    url: `/v1/connections/${pending.id}`,
    headers,
  });
  assert.equal(
    (await app.inject(`/v1/connections/${pending.id}`)).json().status,
    "cancelled",
  );
  assert.equal((await app.inject("/v1/providers")).json()[0].configured, false);
});

test("Durable persists conversation and deduplicates retries across restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-conversation-"));
  t.after(() => rm(directory, { recursive: true }));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([fauxAssistantMessage("Saved answer")]);
  const input = {
    provider: faux.provider.id,
    model: faux.getModel().id,
    text: "Hello",
    requestId: "test-request",
  };
  const first = await openConversation(models, directory);
  let id: string;
  await first.configure(input);
  try {
    id = (await first.submit(input)).id;
    const done = await until(
      () => first.snapshot(),
      (value) => value.outcome === "done",
    );
    assert.equal(done.messages.at(-1)?.text, "Saved answer");
    assert.equal((await first.submit(input)).id, id);
  } finally {
    await first.close();
  }
  const second = await openConversation(models, directory);
  try {
    assert.equal((await second.submit(input)).id, id);
    assert.equal(
      (await second.snapshot()).messages.filter(
        (message) => message.role === "user",
      ).length,
      1,
    );
    assert.equal(faux.state.callCount, 1);
  } finally {
    await second.close();
  }
});

test("unfinished work waits for explicit resume; cancellation survives restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-recovery-"));
  t.after(() => rm(directory, { recursive: true }));
  const faux = fauxProvider({ tokensPerSecond: 1 });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage("An answer deliberately long enough to interrupt"),
  ]);
  const first = await openConversation(models, directory);
  await first.configure({
    provider: faux.provider.id,
    model: faux.getModel().id,
  });
  await first.submit({
    text: "Start",
    requestId: "interrupt",
  });
  await until(
    () => first.snapshot(),
    (value) => value.status === "running",
  );
  await first.close();
  const calls = faux.state.callCount;
  const second = await openConversation(models, directory);
  try {
    assert.equal((await second.snapshot()).status, "interrupted");
    assert.equal(faux.state.callCount, calls);
    await second.cancel();
    assert.equal((await second.snapshot()).status, "idle");
  } finally {
    await second.close();
  }
  const third = await openConversation(models, directory);
  try {
    assert.equal((await third.snapshot()).status, "idle");
    await third.resume();
    assert.equal((await third.snapshot()).status, "idle");
    assert.equal(faux.state.callCount, calls);
  } finally {
    await third.close();
  }
});

test("explicit resume finishes interrupted work without another user input", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-resume-"));
  t.after(() => rm(directory, { recursive: true }));
  const slow = fauxProvider({ tokensPerSecond: 1 });
  const models = createModels();
  models.setProvider(slow.provider);
  slow.setResponses([fauxAssistantMessage("An unfinished response")]);
  const first = await openConversation(models, directory);
  await first.configure({
    provider: slow.provider.id,
    model: slow.getModel().id,
  });
  await first.submit({
    text: "Continue this",
    requestId: "resume",
  });
  await until(
    () => first.snapshot(),
    (value) => value.status === "running",
  );
  await first.close();
  const fast = fauxProvider();
  models.setProvider(fast.provider);
  fast.setResponses([fauxAssistantMessage("Recovered answer")]);
  const second = await openConversation(models, directory);
  try {
    assert.equal((await second.snapshot()).status, "interrupted");
    await second.resume();
    const done = await until(
      () => second.snapshot(),
      (value) => value.outcome === "done",
    );
    assert.equal(done.messages.at(-1)?.text, "Recovered answer");
    assert.equal(
      done.messages.filter((message) => message.role === "user").length,
      1,
    );
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
  const providers = createProviders(models, "test-device");
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

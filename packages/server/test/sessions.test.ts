import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import { openConversation } from "../src/conversation.ts";

const headers = { "x-console-request": "1" };
const options = {
  models: [
    { id: "reasoning", reasoning: true },
    { id: "plain", reasoning: false },
  ],
};

function fixture(directory: string, slow = false) {
  const faux = fauxProvider({
    ...options,
    ...(slow ? { tokensPerSecond: 1 } : {}),
  });
  const model = faux.getModel("reasoning");
  assert.ok(model);
  model.thinkingLevelMap = {
    off: null,
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: null,
    max: null,
  };
  const models = createModels();
  models.setProvider(faux.provider);
  return {
    faux,
    models,
    app: createApp({}, { dataDirectory: directory, models: () => models }),
    config: {
      provider: faux.provider.id,
      model: "reasoning",
      thinkingLevel: "high",
    },
  };
}

async function waitFor<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
) {
  for (let n = 0; n < 200; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected session state did not arrive");
}

test("session creation is idempotent and model/thinking configuration persists", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-sessions-"));
  let { app, config } = fixture(directory);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  assert.deepEqual((await app.inject("/v1/sessions")).json(), []);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/sessions",
        headers,
        payload: { name: "  ", requestId: "blank" },
      })
    ).statusCode,
    400,
  );
  const request = {
    method: "POST" as const,
    url: "/v1/sessions",
    headers,
    payload: { name: "Research", requestId: "create-once" },
  };
  const results = await Promise.all([app.inject(request), app.inject(request)]);
  assert.equal(results[0].statusCode, 201);
  const id = results[0].json().id;
  assert.equal(results[1].json().id, id);
  assert.equal((await app.inject("/v1/sessions")).json().length, 1);
  const endpoint = `/v1/sessions/${id}`;
  const provider = (await app.inject("/v1/providers")).json()[0];
  assert.deepEqual(
    provider.models.find((model: { id: string }) => model.id === "reasoning")
      .thinkingLevels,
    ["low", "medium", "high"],
  );
  assert.deepEqual(
    provider.models.find((model: { id: string }) => model.id === "plain")
      .thinkingLevels,
    ["off"],
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${endpoint}/config`,
        headers,
        payload: { ...config, thinkingLevel: "max" },
      })
    ).statusCode,
    400,
  );
  const saved = await app.inject({
    method: "PATCH",
    url: `${endpoint}/config`,
    headers,
    payload: config,
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().thinkingLevel, "high");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${endpoint}/messages`,
        headers,
        payload: { text: " \n\t", requestId: "blank-message" },
      })
    ).statusCode,
    400,
  );
  assert.equal((await app.inject("/v1/sessions/missing")).statusCode, 404);
  await app.close();
  ({ app, config } = fixture(directory));
  assert.equal((await app.inject(endpoint)).json().thinkingLevel, "high");
  assert.equal((await app.inject(endpoint)).json().model.modelId, "reasoning");
  assert.equal((await app.inject(request)).json().id, id);
});

test("sessions isolate transcripts and pass the saved thinking level to Pi", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-isolation-"));
  const { app, faux, config } = fixture(directory);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const received: (string | undefined)[] = [];
  const response: FauxResponseFactory = (context, stream) => {
    received.push(stream?.reasoning);
    return fauxAssistantMessage(
      JSON.stringify(
        context.messages.filter(
          (message: { role: string }) => message.role === "user",
        ),
      ),
    );
  };
  faux.setResponses([response, response]);
  const ids: string[] = [];
  for (const name of ["Alpha", "Beta"]) {
    const created = (
      await app.inject({
        method: "POST",
        url: "/v1/sessions",
        headers,
        payload: { name, requestId: name },
      })
    ).json();
    ids.push(created.id);
    await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${created.id}/config`,
      headers,
      payload: config,
    });
  }
  await Promise.all(
    ids.map((id, n) =>
      app.inject({
        method: "POST",
        url: `/v1/sessions/${id}/messages`,
        headers,
        payload: {
          text: n === 0 ? "Only alpha" : "Only beta",
          requestId: "same-id-different-sessions",
        },
      }),
    ),
  );
  for (let n = 0; n < ids.length; n++) {
    const view = await waitFor(
      async () => (await app.inject(`/v1/sessions/${ids[n]}`)).json(),
      (value) => value.outcome === "done",
    );
    assert.equal(
      view.messages.filter(
        (message: { role: string }) => message.role === "user",
      ).length,
      1,
    );
    assert.ok(
      view.messages.at(-1).text.includes(n === 0 ? "Only alpha" : "Only beta"),
    );
    assert.ok(
      !view.messages.at(-1).text.includes(n === 0 ? "Only beta" : "Only alpha"),
    );
  }
  assert.deepEqual(received, ["high", "high"]);
});

test("active work blocks configuration changes without blocking another session", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-busy-"));
  const { app, faux, config } = fixture(directory, true);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  faux.setResponses([
    fauxAssistantMessage("Long-running alpha response"),
    fauxAssistantMessage("Long-running beta response"),
  ]);
  const endpoints: string[] = [];
  for (const name of ["Alpha", "Beta"]) {
    const id = (
      await app.inject({
        method: "POST",
        url: "/v1/sessions",
        headers,
        payload: { name, requestId: name },
      })
    ).json().id;
    const endpoint = `/v1/sessions/${id}`;
    endpoints.push(endpoint);
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `${endpoint}/config`,
          headers,
          payload: config,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `${endpoint}/messages`,
          headers,
          payload: { text: name, requestId: name },
        })
      ).statusCode,
      202,
    );
    await waitFor(
      async () => (await app.inject(endpoint)).json(),
      (value) => value.status === "running",
    );
  }
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${endpoints[0]}/config`,
        headers,
        payload: { ...config, thinkingLevel: "low" },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${endpoints[0]}/cancel`,
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal((await app.inject(endpoints[0])).json().status, "idle");
  assert.equal((await app.inject(endpoints[1])).json().status, "running");
  await app.inject({ method: "POST", url: `${endpoints[1]}/cancel`, headers });
});

test("the original conversation is registered once without moving its database", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-import-"));
  const { models, faux, app, config } = fixture(directory);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  faux.setResponses([fauxAssistantMessage("Original answer")]);
  const original = await openConversation(models, directory);
  await original.configure({ ...config, thinkingLevel: "high" });
  await original.submit({ text: "Original message", requestId: "original" });
  await waitFor(
    () => original.snapshot(),
    (value) => value.outcome === "done",
  );
  await original.close();
  const list = (await app.inject("/v1/sessions")).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "default");
  const view = (await app.inject("/v1/sessions/default")).json();
  assert.equal(view.messages.at(-1).text, "Original answer");
  assert.equal(view.thinkingLevel, "high");
  assert.equal((await app.inject("/v1/sessions")).json().length, 1);
});

test("one damaged session does not hide healthy sessions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-unavailable-"));
  let { app } = fixture(directory);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const ids: string[] = [];
  for (const name of ["Damaged", "Healthy"])
    ids.push(
      (
        await app.inject({
          method: "POST",
          url: "/v1/sessions",
          headers,
          payload: { name, requestId: name },
        })
      ).json().id,
    );
  await app.close();
  await writeFile(
    join(directory, "sessions", ids[0], "conversation.sqlite"),
    "not a SQLite database",
  );
  ({ app } = fixture(directory));
  const list = (await app.inject("/v1/sessions")).json();
  assert.equal(
    list.find((item: { id: string }) => item.id === ids[0]).status,
    "unavailable",
  );
  assert.equal((await app.inject(`/v1/sessions/${ids[1]}`)).statusCode, 200);
});

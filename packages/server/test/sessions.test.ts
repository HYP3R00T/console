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
  fauxText,
  fauxThinking,
} from "@earendil-works/pi-ai/providers/faux";
import { Harness } from "@earendil-works/pi-durable";
import { createApp } from "../src/app.ts";
import { openConversation } from "../src/runtime/session.ts";
import { defaultSandbox } from "../src/sandbox/policy.ts";

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

test("reasoning streams separately from the answer, omits signatures, and survives reopen", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-reasoning-"));
  const faux = fauxProvider({
    ...options,
    tokensPerSecond: 40,
    tokenSize: { min: 1, max: 1 },
  });
  const models = createModels();
  models.setProvider(faux.provider);
  let conversation = await openConversation(models, directory);
  t.after(async () => {
    await conversation.close();
    await rm(directory, { recursive: true });
  });
  faux.setResponses([
    fauxAssistantMessage([
      {
        ...fauxThinking("Inspect the constraints first."),
        thinkingSignature: "opaque-secret",
      },
      fauxThinking("Then compare the available options."),
      {
        ...fauxThinking("redacted-payload"),
        redacted: true,
        thinkingSignature: "encrypted-secret",
      },
      fauxText("Here is the answer."),
    ]),
    fauxAssistantMessage("A plain answer."),
  ]);
  await conversation.configure({
    provider: faux.provider.id,
    model: "reasoning",
    thinkingLevel: "high",
  });
  await conversation.submit({
    text: "Compare options",
    requestId: "reasoning",
  });
  const streaming = await waitFor(
    () => conversation.snapshot(),
    (value) =>
      value.partialReasoning.some(
        (part) => part.streaming && part.text.length > 0,
      ),
  );
  assert.equal(streaming.partial, "");
  const answered = await waitFor(
    () => conversation.snapshot(),
    (value) => value.status === "idle",
  );
  const answer = answered.messages.find(
    (message) => message.role === "assistant",
  );
  assert.equal(answer?.text, "Here is the answer.");
  assert.deepEqual(answer?.reasoning, [
    {
      id: "thinking-0",
      text: "Inspect the constraints first.",
      streaming: false,
    },
    {
      id: "thinking-1",
      text: "Then compare the available options.",
      streaming: false,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(answered),
    /opaque-secret|encrypted-secret|redacted-payload/,
  );
  await conversation.close();
  conversation = await openConversation(models, directory);
  assert.deepEqual((await conversation.snapshot()).messages, answered.messages);
  await conversation.submit({
    text: "No reasoning needed",
    requestId: "plain",
  });
  const plain = await waitFor(
    () => conversation.snapshot(),
    (value) => value.status === "idle",
  );
  assert.deepEqual(plain.messages.at(-1)?.reasoning, []);
});

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
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${endpoints[1]}/sandbox`,
        headers,
        payload: {
          ...defaultSandbox(),
          workspace: (await app.inject(endpoints[1])).json().sandbox.workspace,
        },
      })
    ).statusCode,
    409,
  );
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
  const batch = (await app.inject("/v1/sessions?include=conversations")).json();
  assert.equal(
    batch.find((item: { id: string }) => item.id === ids[0]).status,
    "unavailable",
  );
  assert.equal(
    batch.find((item: { id: string }) => item.id === ids[1]).conversations
      .length,
    1,
  );
});

test("batched session summaries preserve conversation hierarchy and exclude Trash", async (t) => {
  const inspections: { callCount(): number; resetCalls(): void }[] = [];
  const open = Harness.open;
  t.mock.method(Harness, "open", async (...args: Parameters<typeof open>) => {
    const harness = await open(...args);
    inspections.push(t.mock.method(harness, "inspect").mock);
    return harness;
  });
  const directory = await mkdtemp(join(tmpdir(), "console-batch-"));
  const { app } = fixture(directory);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  for (const requestId of ["first", "second"]) {
    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { requestId },
    });
    assert.equal(created.statusCode, 201);
    const base = `/v1/sessions/${created.json().id}`;
    for (const name of ["Retained", "Trashed"]) {
      const conversation = await app.inject({
        method: "POST",
        url: `${base}/conversations`,
        headers,
        payload: { name, requestId: name },
      });
      assert.equal(conversation.statusCode, 201);
      if (name === "Trashed")
        assert.equal(
          (
            await app.inject({
              method: "DELETE",
              url: `${base}/conversations/${conversation.json().id}`,
              headers,
            })
          ).statusCode,
          204,
        );
    }
  }
  const plain = (await app.inject("/v1/sessions")).json();
  for (const inspection of inspections) inspection.resetCalls();
  const batch = (await app.inject("/v1/sessions?include=conversations")).json();
  assert.equal(
    inspections.reduce(
      (total, inspection) => total + inspection.callCount(),
      0,
    ),
    4,
  ); // One summary and one list inspection per session.
  assert.equal(batch.length, 2);
  for (const [index, { conversations, ...summary }] of batch.entries()) {
    assert.deepEqual(summary, plain[index]);
    assert.deepEqual(
      conversations,
      (await app.inject(`/v1/sessions/${summary.id}/conversations`)).json(),
    );
    assert.deepEqual(
      conversations.map((item: { name: string }) => item.name),
      ["Main", "Retained"],
    );
  }
  assert.equal(
    (await app.inject("/v1/sessions?include=credentials")).statusCode,
    400,
  );
});

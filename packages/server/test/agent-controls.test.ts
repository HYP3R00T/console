import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import { openAgentState } from "../src/runtime/coordination.ts";

const headers = { "x-console-request": "1" };
async function wait<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let n = 0; n < 300; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((accept) => setTimeout(accept, 10));
  }
  throw new Error("Agent operation did not settle");
}

test("machine state rejects stale edits and deduplicates tool receipts across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "console-state-"));
  let state = openAgentState(directory);
  try {
    const original = state.get();
    assert.deepEqual(state.save({ count: 1 }, original.revision, "tool:1"), {
      value: { count: 1 },
      revision: 1,
    });
    assert.throws(
      () => state.save({ count: 2 }, original.revision),
      /State changed/,
    );
    state.close();
    state = openAgentState(directory);
    assert.deepEqual(state.save({ count: 1 }, original.revision, "tool:1"), {
      value: { count: 1 },
      revision: 1,
    });
    assert.throws(
      () => state.save([] as unknown as Record<string, unknown>, 1),
      /JSON object/,
    );
  } finally {
    state.close();
    await rm(directory, { recursive: true });
  }
});

test("numbered agents, real tool controls, native forks and task-owned subagents persist", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-agents-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let app = createApp({}, { dataDirectory: directory, models: () => models });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: { requestId: "numbered" },
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().name, "Conversation #1");
  const base = `/v1/sessions/${created.json().id}`;
  const next = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: { requestId: "numbered-2" },
  });
  assert.equal(next.json().name, "Conversation #2");
  const unnamed = {
    method: "POST" as const,
    url: `${base}/conversations`,
    headers,
    payload: { requestId: "root" },
  };
  const root = await app.inject(unnamed);
  assert.equal(root.statusCode, 201, root.body);
  assert.equal(root.json().name, `Root #${root.json().id}`);
  assert.equal((await app.inject(unnamed)).json().id, root.json().id);
  const inspection = (await app.inject(`${base}/inspect`)).json();
  assert.ok(
    inspection.tools.some(
      (tool: { name: string; enabled: boolean }) =>
        tool.name === "subagent" && tool.enabled,
    ),
  );
  assert.ok(
    inspection.tools.some(
      (tool: { name: string; permitted: boolean }) =>
        tool.name === "run_command" && !tool.permitted,
    ),
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/agent`,
        headers,
        payload: { tools: ["run_command"] },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/agent`,
        headers,
        payload: {
          tools: ["read_state", "update_state", "subagent"],
          instructions: "Delegate only when asked.",
        },
      })
    ).statusCode,
    200,
  );
  const extensionUrl = `${base}/extensions`;
  const disabled = await app.inject({
    method: "PATCH",
    url: extensionUrl,
    headers,
    payload: { name: "console.agent", enabled: false },
  });
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.equal(
    disabled
      .json()
      .extensions.find(
        (item: { name: string }) => item.name === "console.agent",
      ).enabled,
    false,
  );
  assert.ok(
    !disabled
      .json()
      .tools.some(
        (item: { name: string; enabled: boolean }) =>
          item.name === "subagent" && item.enabled,
      ),
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/agent`,
        headers,
        payload: { tools: ["subagent"] },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: extensionUrl,
        headers,
        payload: { name: "console.agent", enabled: true },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: extensionUrl,
        headers,
        payload: { name: "unknown-code", enabled: true },
      })
    ).statusCode,
    404,
  );
  const config = {
    provider: faux.provider.id,
    model: "faux-model",
    thinkingLevel: "off",
  };
  const provider = (await app.inject("/v1/providers?connected=true")).json()[0];
  config.model = provider.models[0].id;
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/config`,
        headers,
        payload: config,
      })
    ).statusCode,
    200,
  );
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_state", {}), {
      stopReason: "toolUse",
    }),
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && !result.isError);
      return fauxAssistantMessage(
        fauxToolCall("update_state", {
          value_json: '{"delegation":"started"}',
          revision: 0,
        }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage(
      fauxToolCall("subagent", { task: "Report a short result" }),
      { stopReason: "toolUse" },
    ),
    () => fauxAssistantMessage("Child done"),
    (context) => {
      const last = context.messages.at(-1);
      assert.ok(last?.role === "toolResult" && !last.isError);
      return fauxAssistantMessage("Delegation done");
    },
  ]);
  const submitted = await app.inject({
    method: "POST",
    url: `${base}/messages`,
    headers,
    payload: { text: "Delegate the task", requestId: "delegate" },
  });
  assert.equal(submitted.statusCode, 202, submitted.body);
  const result = await wait(
    async () => (await app.inject(base)).json(),
    (value) =>
      value.status === "idle" &&
      value.messages.at(-1)?.text === "Delegation done",
  );
  assert.deepEqual((await app.inject("/v1/state")).json().value, {
    delegation: "started",
  });
  const agents = (await app.inject(`${base}/conversations`)).json();
  const child = agents.find(
    (item: { kind: string }) => item.kind === "subagent",
  );
  assert.ok(child, JSON.stringify(result.messages));
  assert.equal(child.parentId, created.json().conversationId);
  assert.ok(
    !(await app.inject(`${base}/conversations/${child.id}/inspect`))
      .json()
      .tools.some(
        (tool: { name: string; enabled: boolean }) =>
          tool.name === "subagent" && tool.enabled,
      ),
  );
  const forkRequest = {
    method: "POST" as const,
    url: `${base}/fork`,
    headers,
    payload: {
      entryId: result.messages.at(-1).entryId,
      requestId: "fork-once",
    },
  };
  const fork = await app.inject(forkRequest);
  assert.equal(fork.statusCode, 201, fork.body);
  assert.equal((await app.inject(forkRequest)).json().id, fork.json().id);
  const forkHistory = (
    await app.inject(`${base}/conversations/${fork.json().id}`)
  ).json();
  assert.ok(
    forkHistory.messages.some(
      (item: { text: string }) => item.text === "Delegation done",
    ),
  );
  await app.close();
  app = createApp({}, { dataDirectory: directory, models: () => models });
  const restored = (await app.inject(`${base}/conversations`)).json();
  assert.ok(
    restored.some(
      (item: { id: string; parentId: string }) =>
        item.id === fork.json().id &&
        item.parentId === created.json().conversationId,
    ),
  );
  assert.equal(
    (await app.inject(`${base}/inspect`)).json().instructions,
    "Delegate only when asked.",
  );
});

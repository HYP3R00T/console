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
import type { Conversation } from "../../web/src/lib/api.ts";
import { createApp } from "../src/app.ts";

const headers = { "x-console-request": "1" };
async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let n = 0; n < 400; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Runtime control did not settle");
}

test("steers join the current run, follow-ups wait, withdrawal is scoped and retries deduplicate", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-inbox-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const app = createApp({}, { dataDirectory: directory, models: () => models });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.after(async () => {
    release();
    await app.close();
    await rm(directory, { recursive: true });
  });
  const created = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { requestId: "inbox" },
    })
  ).json<Conversation>();
  const base = `/v1/sessions/${created.id}`;
  const read = async () => (await app.inject(base)).json<Conversation>();
  const post = (path: string, payload: object) =>
    app.inject({ method: "POST", url: `${base}/${path}`, headers, payload });
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  faux.setResponses([
    async () => {
      await gate;
      return fauxAssistantMessage(fauxToolCall("read_state", {}), {
        stopReason: "toolUse",
      });
    },
    (context) => {
      const messages = JSON.stringify(context.messages);
      assert.ok(messages.includes("Use the corrected goal"));
      assert.ok(!messages.includes("Do the next task"));
      assert.ok(!messages.includes("Withdraw this"));
      return fauxAssistantMessage("Steered result");
    },
    (context) => {
      assert.ok(JSON.stringify(context.messages).includes("Do the next task"));
      return fauxAssistantMessage("Follow-up result");
    },
  ]);
  assert.equal(
    (await post("messages", { text: "Start", requestId: "start" })).statusCode,
    202,
  );
  await until(read, (value) => value.status === "running");
  for (const path of ["compact", "reset"]) {
    assert.equal(
      (await post(path, { requestId: `busy-${path}` })).statusCode,
      409,
    );
  }
  const inspection = (await app.inject(`${base}/inspect`)).json();
  assert.ok(
    inspection.taskGraph.some(
      (task: { conversationId: string; background: boolean }) =>
        task.conversationId === created.conversationId &&
        typeof task.background === "boolean",
    ),
  );
  assert.equal(
    (await post("messages", { text: "Reject", requestId: "reject" }))
      .statusCode,
    409,
  );
  const steer = {
    text: "Use the corrected goal",
    requestId: "steer",
    whenBusy: "steer",
  };
  const admission = await post("messages", steer);
  assert.equal(admission.statusCode, 202, admission.body);
  assert.equal((await post("messages", steer)).json().id, admission.json().id);
  assert.equal(
    (
      await post("messages", {
        text: "Do the next task",
        requestId: "follow",
        whenBusy: "followUp",
      })
    ).statusCode,
    202,
  );
  const withdrawn = await post("messages", {
    text: "Withdraw this",
    requestId: "withdraw",
    whenBusy: "followUp",
  });
  assert.equal((await read()).queue?.length, 3);
  const other = (await post("conversations", { requestId: "other" })).json();
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `${base}/conversations/${other.id}/submissions/${withdrawn.json().id}`,
        headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `${base}/submissions/${withdrawn.json().id}`,
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal((await read()).queue?.length, 2);
  release();
  const done = await until(
    read,
    (value) =>
      value.status === "idle" &&
      value.messages.at(-1)?.text === "Follow-up result",
  );
  assert.equal(done.queue?.length, 0);
  assert.equal(
    done.messages.filter((item) => item.text === steer.text).length,
    1,
  );
  assert.ok(done.usage && Object.keys(done.usage.models).length > 0);
  assert.ok((done.contextUsage?.estimatedTokens ?? 0) > 0);
  assert.equal(
    (
      await post("messages", {
        text: "Invalid",
        requestId: "invalid",
        whenBusy: "unknown",
      })
    ).statusCode,
    400,
  );
});

test("queued input survives reopening but controls never resume interrupted work implicitly", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-inbox-reopen-"));
  const faux = fauxProvider({ tokensPerSecond: 1 });
  const models = createModels();
  models.setProvider(faux.provider);
  const options = { dataDirectory: directory, models: () => models };
  let app = createApp({}, options);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const created = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { requestId: "reopen" },
    })
  ).json<Conversation>();
  const base = `/v1/sessions/${created.id}`;
  const post = (path: string, payload: object) =>
    app.inject({ method: "POST", url: `${base}/${path}`, headers, payload });
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  faux.setResponses([
    fauxAssistantMessage("An intentionally unfinished answer"),
  ]);
  await post("messages", { text: "Start", requestId: "start" });
  await until(
    async () => (await app.inject(base)).json<Conversation>(),
    (value) => value.status === "running",
  );
  await post("messages", {
    text: "Later",
    requestId: "later",
    whenBusy: "followUp",
  });
  await app.close();
  const calls = faux.state.callCount;
  app = createApp({}, options);
  const snapshot = (await app.inject(base)).json<Conversation>();
  assert.equal(snapshot.status, "interrupted");
  assert.equal(snapshot.queue?.[0]?.text, "Later");
  for (const [path, payload] of [
    ["messages", { text: "New steer", requestId: "new", whenBusy: "steer" }],
    ["compact", { requestId: "compact" }],
    ["reset", { requestId: "reset" }],
  ] as const)
    assert.equal((await post(path, payload)).statusCode, 409);
  assert.equal(faux.state.callCount, calls);
  await app.inject({ method: "POST", url: `${base}/cancel`, headers });
  assert.equal((await app.inject(base)).json<Conversation>().queue?.length, 0);
});

test("manual compaction deduplicates across restart; reset retains history and changes model context", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-context-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const options = { dataDirectory: directory, models: () => models };
  let app = createApp({}, options);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const created = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { requestId: "context" },
    })
  ).json<Conversation>();
  const base = `/v1/sessions/${created.id}`;
  const read = async () => (await app.inject(base)).json<Conversation>();
  const post = (path: string, payload: object) =>
    app.inject({ method: "POST", url: `${base}/${path}`, headers, payload });
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  const oldText = `Old task evidence. ${"saved context ".repeat(2200)}`;
  faux.setResponses([
    fauxAssistantMessage(oldText),
    fauxAssistantMessage(oldText),
    fauxAssistantMessage(oldText),
    (context) => {
      assert.ok(
        JSON.stringify(context.messages).includes(
          "Keep the failing test names",
        ),
      );
      return fauxAssistantMessage(
        "Summary: retain test names and current goal.",
      );
    },
  ]);
  for (let n = 0; n < 3; n++) {
    assert.equal(
      (
        await post("messages", {
          text: `Old question ${n}`,
          requestId: `old-${n}`,
        })
      ).statusCode,
      202,
    );
    await until(read, (value) => value.status === "idle");
  }
  const before = await read();
  const compact = {
    requestId: "compact-once",
    instructions: "Keep the failing test names",
  };
  const compacted = await post("compact", compact);
  assert.equal(compacted.statusCode, 202, compacted.body);
  assert.equal((await post("compact", compact)).json().id, compacted.json().id);
  await until(
    read,
    (value) => value.status === "idle" && !value.compactions?.length,
  );
  assert.equal(faux.state.callCount, 4);
  const after = await read();
  assert.ok(after.contextUsage && before.contextUsage);
  assert.ok(
    after.contextUsage.estimatedTokens < before.contextUsage.estimatedTokens,
  );
  await app.close();
  app = createApp({}, options);
  assert.equal((await post("compact", compact)).json().id, compacted.json().id);
  assert.equal(faux.state.callCount, 4);
  const reset = {
    requestId: "reset-once",
    handoff: "Continue from the handoff note",
  };
  const resetAdmission = await post("reset", reset);
  assert.equal(resetAdmission.statusCode, 202, resetAdmission.body);
  assert.equal(
    (await post("reset", reset)).json().id,
    resetAdmission.json().id,
  );
  assert.equal(faux.state.callCount, 4);
  assert.ok((await read()).messages.some((item) => item.text === oldText));
  faux.appendResponses([
    (context) => {
      const messages = JSON.stringify(context.messages);
      assert.ok(messages.includes(reset.handoff));
      assert.ok(!messages.includes("Old task evidence"));
      return fauxAssistantMessage("New context answer");
    },
  ]);
  await post("messages", { text: "Continue", requestId: "new-context" });
  await until(
    read,
    (value) =>
      value.status === "idle" &&
      value.messages.at(-1)?.text === "New context answer",
  );
});

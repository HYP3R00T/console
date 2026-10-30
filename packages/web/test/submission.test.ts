import assert from "node:assert/strict";
import test from "node:test";
import { sameConfiguration, submitDraft } from "../src/lib/chat/submission.ts";

const configuration = {
  provider: "test",
  model: "new-model",
  thinkingLevel: "high",
};
const current = {
  model: { provider: "test", modelId: "old-model" },
  thinkingLevel: "low",
  status: "idle" as const,
};

test("changing a draft has no remote effects; Send applies configuration before admitting text", async () => {
  const calls: unknown[] = [];
  const draft = { text: "Build a test", requestId: "input-1", configuration };
  const write = async (
    path: string,
    method: "PATCH" | "POST",
    body: unknown,
  ) => {
    calls.push({ path, method, body });
  };
  assert.equal(calls.length, 0);
  await submitDraft("/conversation", draft, current, write, () =>
    calls.push("configuration-confirmed"),
  );
  assert.deepEqual(calls, [
    { path: "/conversation/config", method: "PATCH", body: configuration },
    "configuration-confirmed",
    {
      path: "/conversation/messages",
      method: "POST",
      body: { text: "Build a test", requestId: "input-1" },
    },
  ]);
});
test("unchanged configuration does not produce a redundant write", async () => {
  const calls: string[] = [];
  await submitDraft(
    "/conversation",
    {
      text: "hello",
      requestId: "same",
      configuration: {
        provider: "test",
        model: "old-model",
        thinkingLevel: "low",
      },
    },
    current,
    async (path) => {
      calls.push(path);
    },
    () => {},
  );
  assert.deepEqual(calls, ["/conversation/messages"]);
  assert.ok(sameConfiguration(undefined, undefined));
});
test("configuration failure never sends the message", async () => {
  const calls: string[] = [];
  let applied = false;
  await assert.rejects(
    submitDraft(
      "/conversation",
      { text: "keep my text", requestId: "failed", configuration },
      current,
      async (path) => {
        calls.push(path);
        throw new Error("configuration rejected");
      },
      () => {
        applied = true;
      },
    ),
    /configuration rejected/,
  );
  assert.equal(applied, false);
  assert.deepEqual(calls, ["/conversation/config"]);
});
test("an uncertain message retry keeps its admission identity without reconfiguring running work", async () => {
  const calls: unknown[] = [];
  await submitDraft(
    "/conversation",
    {
      text: "original",
      requestId: "original-id",
      whenBusy: "followUp",
      configuration,
      configurationApplied: true,
    },
    { ...current, status: "running" },
    async (path, method, body) => {
      calls.push({ path, method, body });
    },
    () => assert.fail("already configured"),
  );
  assert.deepEqual(calls, [
    {
      path: "/conversation/messages",
      method: "POST",
      body: {
        text: "original",
        requestId: "original-id",
        whenBusy: "followUp",
      },
    },
  ]);
});
test("changed configuration waits for idle while ordinary follow-ups remain usable", async () => {
  const calls: string[] = [];
  const write = async (path: string) => {
    calls.push(path);
  };
  await assert.rejects(
    submitDraft(
      "/conversation",
      { text: "new model", requestId: "blocked", configuration },
      { ...current, status: "running" },
      write,
      () => {},
    ),
    /Wait for the current work/,
  );
  assert.equal(calls.length, 0);
  await submitDraft(
    "/conversation",
    { text: "follow up", requestId: "queue", whenBusy: "followUp" },
    { ...current, status: "running" },
    write,
    () => {},
  );
  assert.deepEqual(calls, ["/conversation/messages"]);
});

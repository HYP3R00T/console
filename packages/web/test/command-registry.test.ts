import assert from "node:assert/strict";
import test from "node:test";
import { executeBackendCommand } from "../src/lib/backend/commands.ts";
import {
  CommandRegistry,
  slashSuggestions,
} from "../src/lib/command-registry.ts";

test("one handler serves every trigger and never crosses active target contexts", async () => {
  const registry = new CommandRegistry(),
    calls: string[] = [];
  const releaseA = registry.register("/a", {
    "conversation.stop": { run: () => calls.push("a") },
  });
  const releaseB = registry.register("/b", {
    "conversation.stop": { run: () => calls.push("b") },
    "conversation.continue": {
      disabled: "No eligible failure",
      run: () => assert.fail(),
    },
  });
  for (const _trigger of ["button", "shortcut", "palette", "slash"])
    registry.invoke("conversation.stop", "/a");
  registry.invoke("conversation.stop", "/b");
  assert.deepEqual(calls, ["a", "a", "a", "a", "b"]);
  assert.throws(
    () => registry.invoke("conversation.continue", "/b"),
    /No eligible failure/,
  );
  releaseA();
  assert.throws(
    () => registry.invoke("conversation.stop", "/a"),
    /unavailable/,
  );
  releaseB();
});
test("cleanup of an older handler preserves newer registration", () => {
  const registry = new CommandRegistry();
  const old = registry.register("/a", {
    "conversation.stop": { run: () => 1 },
  });
  registry.register("/a", { "conversation.stop": { run: () => 2 } });
  old();
  assert.equal(registry.invoke("conversation.stop", "/a"), 2);
});
test("slash discovery requires a leading slash, ignores composition and never executes text", () => {
  assert.equal(slashSuggestions("/", false).length, 4);
  assert.deepEqual(slashSuggestions("/comp", false), [
    ["/compact", "conversation.compact"],
  ]);
  for (const content of ["hello /stop", " /stop", "/stop now", "\n/stop"])
    assert.deepEqual(slashSuggestions(content, false), []);
  assert.deepEqual(slashSuggestions("/stop", true), []);
});
test("HTTP adapters capture the selected target and reject missing context", async () => {
  const calls: unknown[] = [];
  const client = {
    request: async <T>(path: string, init?: RequestInit) => {
      calls.push([path, init]);
      return {} as T;
    },
  };
  await executeBackendCommand(
    client,
    "conversation.stop",
    { sessionId: "session-a", conversationId: "1" },
    {},
  );
  await executeBackendCommand(
    client,
    "conversation.stop",
    { sessionId: "session-b", conversationId: "2" },
    {},
  );
  assert.deepEqual(
    calls.map((call) => (call as unknown[])[0]),
    [
      "/v1/sessions/session-a/conversations/1/stop",
      "/v1/sessions/session-b/conversations/2/stop",
    ],
  );
  assert.throws(
    () => executeBackendCommand(client, "conversation.stop", {}, {}),
    /Select a sessionId/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { togglePlanMode } from "../src/lib/plan-command.ts";

test("Plan mode uses a fresh revision and returns confirmed state for either toggle direction", async () => {
  for (const active of [true, false]) {
    const calls: { path: string; init?: RequestInit }[] = [];
    const confirmed = { revision: "next", plan: { active: !active } };
    const client = {
      request: async <T>(path: string, init?: RequestInit) => {
        calls.push({ path, init });
        return (
          init ? confirmed : { revision: "current", plan: { active } }
        ) as T;
      },
    };
    assert.deepEqual(
      await togglePlanMode(client, { sessionId: "s", conversationId: "1" }),
      confirmed,
    );
    assert.equal(calls[0].path, calls[1].path);
    assert.equal(calls[1].init?.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[1].init?.body as string), {
      revision: "current",
      planMode: !active,
    });
  }
});

test("Plan intent keeps its original target across the read, and failures do not retry or claim success", async () => {
  const target = { sessionId: "original", conversationId: "1" };
  const paths: string[] = [];
  const client = {
    request: async <T>(path: string, init?: RequestInit) => {
      paths.push(path);
      if (!init) {
        target.sessionId = "other";
        return { revision: "stale", plan: { active: false } } as T;
      }
      throw new Error("Revision conflict");
    },
  };
  await assert.rejects(togglePlanMode(client, target), /Revision conflict/);
  assert.equal(paths.length, 2);
  assert.equal(paths[0], paths[1]);
  assert.match(paths[1], /original/);
  let writes = 0;
  await assert.rejects(
    togglePlanMode(
      {
        request: async <T>(_path: string, init?: RequestInit) => {
          if (init) writes++;
          return { revision: "old" } as T;
        },
      },
      target,
    ),
    /unavailable/,
  );
  assert.equal(writes, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Conversation } from "../src/lib/api.ts";
import { createConversationNavigation } from "../src/lib/chat/navigation.ts";

function snapshot(id: string, conversationId: string): Conversation {
  return {
    id,
    conversationId,
    name: conversationId,
    createdAt: "",
    status: "idle",
    thinkingLevel: "low",
    messages: [],
    partial: "",
    hasOlder: false,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("an uncached switch keeps the previous view until its snapshot is ready", async () => {
  const next = deferred<Conversation>();
  let displayed = snapshot("project", "first");
  let busy = false;
  const navigation = createConversationNavigation({
    read: () => next.promise,
    show: (value) => {
      assert.ok(value);
      displayed = value;
    },
    loading: (value) => {
      busy = value;
    },
    error: assert.fail,
  });
  const opening = navigation.open("project", "second");
  assert.equal(displayed.conversationId, "first");
  assert.equal(busy, true);
  next.resolve(snapshot("project", "second"));
  await opening;
  assert.equal(displayed.conversationId, "second");
  assert.equal(busy, false);
});
test("late navigation results cannot replace a newer selection even if a transport ignores abort", async () => {
  const slow = deferred<Conversation>();
  const shown: string[] = [];
  let firstSignal: AbortSignal | undefined;
  const navigation = createConversationNavigation({
    read: async (id, cid, signal) => {
      if (cid === "slow") {
        firstSignal = signal;
        return slow.promise;
      }
      return snapshot(id, cid);
    },
    show: (value) => {
      if (value) shown.push(value.conversationId ?? "");
    },
    loading: () => {},
    error: assert.fail,
  });
  const opening = navigation.open("project", "slow");
  await navigation.open("project", "latest");
  assert.equal(firstSignal?.aborted, true);
  slow.resolve(snapshot("project", "slow"));
  await opening;
  assert.deepEqual(shown, ["latest"]);
});
test("warm switches are immediate, scoped to their runtime and invalidated on deletion", async () => {
  const reads: string[] = [];
  const shown: string[] = [];
  const navigation = createConversationNavigation({
    read: async (id, cid) => {
      reads.push(id);
      return snapshot(id, cid);
    },
    show: (value) => {
      if (value) shown.push(value.id);
    },
    loading: () => {},
    error: assert.fail,
  });
  navigation.remember(snapshot("alpha", "1"));
  const opening = navigation.open("alpha", "1");
  assert.deepEqual(shown, ["alpha"]);
  await opening;
  assert.equal(reads.length, 0);
  await navigation.open("beta", "1");
  navigation.invalidate("alpha", "1");
  await navigation.open("alpha", "1");
  assert.deepEqual(reads, ["beta", "alpha"]);
});
test("failed or cancelled navigation preserves the current view", async () => {
  const shown: unknown[] = [];
  const failures: string[] = [];
  const next = deferred<Conversation>();
  const navigation = createConversationNavigation({
    read: async (_id, cid) => {
      if (cid === "error") throw new Error("offline");
      return next.promise;
    },
    show: (value) => {
      shown.push(value);
    },
    loading: () => {},
    error: (cause) => {
      failures.push(cause.message);
    },
  });
  await navigation.open("project", "error");
  const opening = navigation.open("project", "cancelled");
  navigation.cancel();
  next.resolve(snapshot("project", "cancelled"));
  await opening;
  assert.equal(shown.length, 0);
  assert.deepEqual(failures, ["offline"]);
});
test("the navigation cache evicts old snapshots rather than growing with every conversation", async () => {
  let reads = 0;
  const navigation = createConversationNavigation({
    read: async (id, cid) => {
      reads++;
      return snapshot(id, cid);
    },
    show: () => {},
    loading: () => {},
    error: assert.fail,
  });
  for (let n = 0; n < 21; n++)
    navigation.remember(snapshot("project", String(n)));
  await navigation.open("project", "20");
  assert.equal(reads, 0);
  await navigation.open("project", "0");
  assert.equal(reads, 1);
});

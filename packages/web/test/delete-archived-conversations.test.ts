import assert from "node:assert/strict";
import test from "node:test";
import { deleteArchivedConversations } from "../src/lib/delete-archived-conversations.ts";

const parent = { sessionId: "session", conversationId: 1, name: "Parent" };
const child = { ...parent, conversationId: 2, name: "Child" };

test("bulk deletion retries an archived parent after deleting its dependent child", async () => {
  const removed = new Set<number>();
  const result = await deleteArchivedConversations(
    [parent, child],
    async (target) => {
      if (target === parent && !removed.has(2))
        throw new Error("Dependent history");
      removed.add(target.conversationId);
    },
  );
  assert.equal(result.deleted, 2);
  assert.deepEqual(result.failures, []);
});

test("bulk deletion reports partial failures and stops when no progress is possible", async () => {
  let attempts = 0;
  const result = await deleteArchivedConversations(
    [parent, child],
    async (target) => {
      attempts++;
      if (target === parent) throw new Error("Session is busy");
    },
  );
  assert.equal(result.deleted, 1);
  assert.deepEqual(result.failures, [
    { target: parent, message: "Session is busy" },
  ]);
  assert.equal(attempts, 3);
});

test("an empty archive performs no deletion", async () => {
  assert.deepEqual(
    await deleteArchivedConversations([], async () => assert.fail()),
    {
      deleted: 0,
      failures: [],
    },
  );
});

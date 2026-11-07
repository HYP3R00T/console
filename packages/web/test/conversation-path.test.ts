import assert from "node:assert/strict";
import test from "node:test";
import { standaloneConversationPath } from "../src/lib/conversation-path.ts";

test("standalone links preserve root bookmarks and distinguish fork identities", () => {
  const base = "/devices/local/conversations";
  assert.equal(
    standaloneConversationPath(base, "session", 1),
    `${base}/session`,
  );
  assert.equal(
    standaloneConversationPath(base, "session", "1"),
    `${base}/session`,
  );
  assert.equal(
    standaloneConversationPath(base, "session", 42),
    `${base}/session/42`,
  );
});

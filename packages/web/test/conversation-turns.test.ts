import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationTurns } from "../src/components/sessions/conversation-turns.ts";
import type { ChatMessage } from "../src/components/sessions/use-conversation.ts";

const message = (
  id: string,
  role: ChatMessage["role"],
  text = "",
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  entryId: Number(id),
  role,
  text,
  failed: false,
  ...extra,
});

test("keeps tools and replies with their own prompt, excluding empty tool-call replies", () => {
  const turns = conversationTurns([
    message("1", "user", "Inspect files"),
    message("2", "assistant", "", {
      toolCalls: [{ id: "read", name: "read_file", arguments: "{}" }],
    }),
    message("3", "tool", "file content", { toolName: "read_file" }),
    message("4", "assistant", "First answer"),
    message("5", "user", "Explain the language"),
    message("6", "assistant", "Second answer"),
  ]);
  assert.deepEqual(
    turns.map((turn) => ({
      prompt: turn.prompt?.text,
      replies: turn.replies.map((reply) => reply.text),
      events: turn.activity.length,
    })),
    [
      { prompt: "Inspect files", replies: ["First answer"], events: 2 },
      { prompt: "Explain the language", replies: ["Second answer"], events: 0 },
    ],
  );
});

test("partial history retains orphaned activity and failures without inventing a prompt", () => {
  const turns = conversationTurns([
    message("7", "tool", "Permission denied", { failed: true }),
    message("8", "assistant", "", { failed: true }),
    message("9", "user", "Try another way"),
  ]);
  assert.equal(turns[0].prompt, undefined);
  assert.equal(turns[0].activity[0].failed, true);
  assert.equal(turns[0].replies[0].failed, true);
  assert.equal(turns[1].prompt?.text, "Try another way");
});

test("successive inputs remain distinct display groups even during steering", () => {
  const turns = conversationTurns([
    message("1", "user", "Start"),
    message("2", "user", "Change direction"),
    message("3", "assistant", "Updated answer"),
  ]);
  assert.deepEqual(
    turns.map((turn) => turn.id),
    ["1", "2"],
  );
  assert.equal(turns[0].replies.length, 0);
  assert.equal(turns[1].replies[0].text, "Updated answer");
});

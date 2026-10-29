import assert from "node:assert/strict";
import test from "node:test";
import { mergeMessages } from "../../web/src/lib/chat/history.ts";
import {
  buildTranscript,
  type ChatMessage,
  parsePlan,
  toolOutput,
} from "../../web/src/lib/chat/transcript.ts";

function message(
  id: number,
  role: string,
  text = "",
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return { id: `${id}-0`, entryId: String(id), role, text, ...extra };
}

test("a question, parallel tool round and answer become messages around one lossless activity group", () => {
  const messages = [
    message(1, "user", "Explain this project"),
    message(2, "assistant", "I will read the files", {
      toolCalls: [
        { id: "read-a", name: "read", arguments: { path: "a.ts" } },
        { id: "read-b", name: "read", arguments: { path: "b.ts" } },
      ],
    }),
    message(3, "toolResult", "file B", {
      toolCallId: "read-b",
      toolName: "read",
    }),
    message(4, "toolResult", "file A", {
      toolCallId: "read-a",
      toolName: "read",
    }),
    message(5, "assistant", "**The answer**"),
  ];
  const blocks = buildTranscript(messages);
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["message", "activity", "message"],
  );
  const activity = blocks[1];
  assert.ok(activity.kind === "activity");
  assert.equal(activity.steps.length, 3); // note and two paired tools
  assert.deepEqual(activity.messageIds, ["2-0", "3-0", "4-0"]);
  const tools = activity.steps.filter((step) => step.kind === "tool");
  assert.equal(tools[0].output, "file A");
  assert.equal(tools[1].output, "file B");
  assert.equal(tools[0].status, "done");
});

test("pagination retains orphan results and merges them with their actual calls without duplicate live slots", () => {
  const result = message(4, "toolResult", "saved output", {
    toolCallId: "call",
    toolName: "bash",
  });
  const tail = [result, message(5, "assistant", "Finished")];
  const first = buildTranscript(tail);
  assert.ok(first[0].kind === "activity");
  assert.equal(first[0].steps.length, 1);
  const all = mergeMessages(
    [
      message(1, "user", "Run checks"),
      message(2, "assistant", "", {
        toolCalls: [
          { id: "call", name: "bash", arguments: { command: "pnpm test" } },
        ],
      }),
    ],
    tail,
  );
  const blocks = buildTranscript(all, [
    { id: "call", name: "bash", status: "done", output: "old partial" },
  ]);
  const activity = blocks[1];
  assert.ok(activity.kind === "activity");
  assert.equal(activity.steps.length, 1);
  assert.ok(activity.steps[0].kind === "tool");
  assert.equal(activity.steps[0].output, "saved output");
  assert.ok(activity.messageIds.includes(result.id));
});

test("legacy servers retain ambiguous parallel output without guessing or reopening old work as running", () => {
  const blocks = buildTranscript(
    [
      message(1, "assistant", "", {
        toolCalls: [
          { id: "one", name: "read", arguments: { path: "a" } },
          { id: "two", name: "read", arguments: { path: "b" } },
        ],
      }),
      message(2, "toolResult", "first result", { toolName: "read" }),
      message(3, "toolResult", "second result", { toolName: "read" }),
      message(4, "assistant", "Previous answer"),
      message(5, "user", "Next task"),
    ],
    [],
    true,
  );
  const activity = blocks[0];
  assert.ok(activity.kind === "activity");
  const steps = activity.steps.filter((step) => step.kind === "tool");
  assert.equal(steps.filter((step) => !step.resultOnly).length, 2);
  assert.deepEqual(
    steps.filter((step) => step.resultOnly).map((step) => step.output),
    ["first result", "second result"],
  );
  assert.ok(
    steps
      .filter((step) => !step.resultOnly)
      .every((step) => step.status === "recorded"),
  );
});

test("errors, stopped calls and streamed reasoning remain explicit, without inventing success", () => {
  const failed = buildTranscript([
    message(1, "toolResult", '{"stdout":"","stderr":"failed","exitCode":2}', {
      toolCallId: "failed",
      toolName: "run_command",
    }),
  ]);
  assert.ok(
    failed[0].kind === "activity" && failed[0].steps[0].kind === "tool",
  );
  assert.equal(failed[0].steps[0].status, "error");
  const stopped = buildTranscript(
    [
      message(1, "assistant", "", {
        toolCalls: [{ id: "stopped", name: "read", arguments: {} }],
      }),
    ],
    [{ id: "stopped", name: "read", status: "running" }],
    false,
  );
  assert.ok(
    stopped[0].kind === "activity" && stopped[0].steps[0].kind === "tool",
  );
  assert.equal(stopped[0].steps[0].status, "interrupted");
  const streaming = buildTranscript([message(1, "user", "Think")], [], true, [
    { id: "thinking", text: "Visible reasoning", streaming: true },
  ]);
  assert.deepEqual(
    streaming.map((block) => block.kind),
    ["message", "activity"],
  );
  assert.ok(
    streaming[1].kind === "activity" &&
      streaming[1].steps[0].kind === "reasoning",
  );
  assert.equal(streaming[1].steps[0].text, "Visible reasoning");
  assert.match(
    toolOutput('{"stdout":"out","stderr":"err","exitCode":2,"truncated":true}'),
    /out\nerr\nExit code: 2\nOutput truncated/,
  );
});

test("context boundaries and subsequent user turns remain separate; plans require structured recorded data", () => {
  const blocks = buildTranscript([
    message(1, "user", "First"),
    message(2, "assistant", "Answer"),
    message(3, "user", "Handoff", { kind: "pi.reset" }),
    message(4, "user", "Second"),
  ]);
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["message", "message", "context", "message"],
  );
  assert.equal(parsePlan("a prose guess at a plan"), undefined);
  assert.equal(
    parsePlan('{"title":"Plan","steps":[{"step":"Check","status":"maybe"}]}'),
    undefined,
  );
  assert.equal(
    parsePlan(
      '{"title":"Plan","steps":[{"step":"Check","status":"completed"}]}',
    )?.steps[0].status,
    "completed",
  );
});

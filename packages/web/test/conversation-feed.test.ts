import assert from "node:assert/strict";
import test from "node:test";
import { ChatTranscript } from "../src/components/sessions/chat-transcript.ts";
import {
  ConversationFeed,
  type ConversationFeedState,
} from "../src/components/sessions/conversation-feed.ts";
import type {
  ChatSnapshot,
  TranscriptChunk,
} from "../src/components/sessions/conversation-state.ts";
import {
  executionLabel,
  executionNeedsAttention,
  failureLabel,
} from "../src/components/sessions/execution-labels.ts";
import type { BackendClient } from "../src/lib/backend/client.ts";

function chunk(
  ids: number[],
  before?: number,
  invisible: number[] = [],
): TranscriptChunk {
  return {
    history: { ids, before },
    messages: ids
      .filter((id) => !invisible.includes(id))
      .map((id) => ({
        id: `${id}:0`,
        entryId: id,
        role: "user",
        text: `Entry ${id}`,
        failed: false,
      })),
  };
}
function snapshot(ids: number[], before?: number): ChatSnapshot {
  return {
    ...chunk(ids, before),
    id: 1,
    busy: false,
    partial: "",
    queued: 0,
    hasEarlier: before !== undefined,
  };
}
const allMessages = (transcript: ChatTranscript) =>
  transcript.sections().flatMap((section) => section.messages);

test("sliding windows retain seen entries, deduplicate overlaps and respect invisible/interleaved IDs", () => {
  const transcript = new ChatTranscript();
  const ids = Array.from({ length: 150 }, (_, i) => (i + 1) * 7);
  transcript.merge(chunk(ids.slice(0, 50), undefined, [14, 21]));
  for (let end = 51; end <= ids.length; end++)
    transcript.merge(chunk(ids.slice(end - 50, end), ids[end - 51], [14, 21]));
  assert.equal(allMessages(transcript).length, 148);
  assert.equal(
    new Set(allMessages(transcript).map((message) => message.id)).size,
    148,
  );
  assert.ok(transcript.sections().every((section) => !section.gap));
  assert.equal(allMessages(transcript)[0].entryId, 7);
  assert.equal(allMessages(transcript).at(-1)?.entryId, 1050);
});

test("reconnect gaps remain explicit until raw history bridges them, including invisible records", () => {
  const transcript = new ChatTranscript();
  transcript.merge(chunk([10, 20, 30]));
  transcript.merge(chunk([100, 110], 90));
  assert.deepEqual(transcript.sections()[1].gap, {
    before: 100,
    earlier: false,
  });
  transcript.merge(chunk([70, 80, 90], 60, [70, 80, 90]));
  assert.deepEqual(transcript.sections()[1].gap, {
    before: 70,
    earlier: false,
  });
  transcript.merge(chunk([30, 40, 50, 60], 20));
  assert.ok(transcript.sections().every((section) => !section.gap));
  assert.deepEqual(
    allMessages(transcript).map((message) => message.entryId),
    [10, 20, 30, 40, 50, 60, 100, 110],
  );
  assert.equal(
    new ChatTranscript().merge(chunk([100], 90))[0].gap?.earlier,
    true,
  );
});

test("invalid boundaries cannot corrupt an accumulated transcript", () => {
  const transcript = new ChatTranscript();
  transcript.merge(chunk([10, 20]));
  for (const invalid of [
    chunk([20, 10]),
    chunk([30], 40),
    { ...chunk([30]), messages: chunk([99]).messages },
  ])
    assert.throws(() => transcript.merge(invalid));
  assert.deepEqual(
    allMessages(transcript).map((message) => message.entryId),
    [10, 20],
  );
});

function fixture() {
  let observer: Parameters<BackendClient["subscribe"]>[2];
  let resolvePage!: (page: TranscriptChunk) => void;
  let rejectPage!: (error: Error) => void;
  let signal: AbortSignal | undefined;
  let stopped = false;
  let calls = 0;
  let state: ConversationFeedState;
  const client = {
    origin: "http://localhost:3000",
    subscribe: (_path, _event, next) => {
      observer = next;
      return () => {
        stopped = true;
      };
    },
    request: async (_path, init) => {
      calls++;
      signal = init?.signal ?? undefined;
      return new Promise<TranscriptChunk>((resolve, reject) => {
        resolvePage = resolve;
        rejectPage = reject;
      });
    },
  } as BackendClient;
  const feed = new ConversationFeed(
    client,
    "/v1/sessions/test/conversations/1",
    (next) => {
      state = next;
    },
  );
  feed.start();
  return {
    feed,
    send: (data: ChatSnapshot) => observer.message(JSON.stringify(data)),
    reconnect: () => observer.reconnecting(),
    resolve: (data: TranscriptChunk) => resolvePage(data),
    reject: () => rejectPage(new Error("Offline")),
    get state() {
      return state;
    },
    get stopped() {
      return stopped;
    },
    get calls() {
      return calls;
    },
    get signal() {
      return signal;
    },
  };
}

test("a slow history page preserves newer live state and concurrent loads share one request", async () => {
  const f = fixture();
  f.send(snapshot([10, 20]));
  f.reconnect();
  assert.equal(f.state.status, "Reconnecting…");
  f.send(snapshot([100], 90));
  const first = f.feed.loadHistory(100);
  assert.equal(first, f.feed.loadHistory(100));
  assert.equal(f.calls, 1);
  f.send({
    ...snapshot([100, 110], 90),
    busy: true,
    partial: "Still streaming",
  });
  f.resolve(chunk([20, 30, 40, 50, 60, 70, 80, 90], 10));
  await first;
  assert.equal(f.state.data?.partial, "Still streaming");
  assert.equal(f.state.data?.busy, true);
  assert.ok(f.state.sections.every((section) => !section.gap));
  assert.equal(
    f.state.sections.flatMap((section) => section.messages).length,
    11,
  );
  f.feed.close();
});

test("failed pages keep their gap retryable; closing cancels pages and ignores late callbacks", async () => {
  const f = fixture();
  f.send(snapshot([100], 90));
  const failed = f.feed.loadHistory(100);
  f.reject();
  await assert.rejects(failed, /Offline/);
  assert.equal(f.state.sections[0].gap?.before, 100);
  const retried = f.feed.loadHistory(100);
  assert.equal(f.calls, 2);
  f.feed.close();
  assert.equal(f.signal?.aborted, true);
  const previous = f.state;
  f.send(snapshot([200], 190));
  f.resolve(chunk([90], 80));
  await retried;
  assert.equal(f.state, previous);
  assert.equal(f.stopped, true);
  const other = fixture();
  other.send(snapshot([500], 490));
  assert.deepEqual(
    other.state.sections
      .flatMap((section) => section.messages)
      .map((message) => message.entryId),
    [500],
  );
  other.feed.close();
});

test("status labels distinguish failure and retry states without showing arbitrary diagnostics", () => {
  assert.equal(
    executionLabel({ state: "retrying", tools: [], compactions: [] }),
    "Waiting to retry the model request",
  );
  assert.match(failureLabel("turn_limit"), /tool-round limit/);
  assert.match(failureLabel("interrupted"), /backend was interrupted/);
  assert.equal(
    failureLabel("private-secret"),
    "This run ended without an answer.",
  );
  assert.equal(failureLabel("toString"), "This run ended without an answer.");
});

test("execution notices explain waits and failures without occupying space for idle or routine work", () => {
  assert.equal(executionNeedsAttention(), false);
  for (const state of ["idle", "running", "tools"] as const)
    assert.equal(
      executionNeedsAttention({ state, tools: [], compactions: [] }),
      false,
    );
  for (const state of [
    "retrying",
    "deferred",
    "compacting",
    "finishing",
  ] as const)
    assert.equal(
      executionNeedsAttention({ state, tools: [], compactions: [] }),
      true,
    );
  const idle = { state: "idle" as const, tools: [], compactions: [] };
  assert.equal(
    executionNeedsAttention({
      ...idle,
      failure: { reason: "no_model", taskId: 1 },
    }),
    true,
  );
  assert.equal(
    executionNeedsAttention({
      ...idle,
      compactionFailure: { trigger: "threshold" },
    }),
    true,
  );
  assert.equal(
    executionNeedsAttention({
      ...idle,
      compactions: [
        { taskId: 1, trigger: "threshold", blocking: false, attempt: 1 },
      ],
    }),
    true,
  );
  assert.equal(
    executionNeedsAttention({
      ...idle,
      state: "running",
      failure: { reason: "interrupted", taskId: 1 },
    }),
    false,
  );
});

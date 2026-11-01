import assert from "node:assert/strict";
import test from "node:test";
import { mergeMessages } from "../src/lib/history.ts";
import { startPolling } from "../src/lib/poll.ts";
import { proxy } from "../src/lib/server/proxy.ts";

test("the fixed local proxy never forwards browser authorization", async () => {
  let seen: RequestInit | undefined;
  const response = await proxy(
    new Request("http://localhost:3001/api/v1/projects", {
      headers: { authorization: "Bearer browser-value" },
    }),
    ["projects"],
    async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:3000/v1/projects");
      seen = options;
      return Response.json([{ id: "project" }]);
    },
  );
  assert.equal(response.status, 200);
  assert.equal(new Headers(seen?.headers).get("authorization"), null);
  assert.equal(seen?.redirect, "error");
  assert.doesNotMatch(await response.text(), /browser-value/);
});

test("proxy rejects cross-origin mutations, unknown paths and oversized bodies", async () => {
  const never = async () => {
    throw new Error("Fetch must not run");
  };
  assert.equal(
    (
      await proxy(
        new Request("http://localhost:3001/api/v1/projects", {
          method: "POST",
          headers: {
            "x-console-request": "1",
            origin: "https://attacker.example",
          },
        }),
        ["projects"],
        never,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxy(
        new Request("http://localhost:3001/api/v1/projects", {
          method: "POST",
        }),
        ["projects"],
        never,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxy(
        new Request("http://remote.example/api/v1/projects"),
        ["projects"],
        never,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxy(
        new Request("http://localhost:3001/api/v1/machines"),
        ["machines"],
        never,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await proxy(
        new Request("http://localhost:3001/api/v1/projects", {
          method: "POST",
          headers: { "x-console-request": "1" },
          body: "x".repeat(256 * 1024 + 1),
        }),
        ["projects"],
        never,
      )
    ).status,
    502,
  );
});

test("proxy rejects oversized upstream responses and forwards empty control responses", async () => {
  const request = new Request("http://localhost:3001/api/v1/sessions");
  assert.equal(
    (
      await proxy(
        request,
        ["sessions"],
        async () => new Response("x".repeat(8 * 1024 * 1024 + 1)),
      )
    ).status,
    502,
  );
  assert.equal(
    (
      await proxy(
        request,
        ["sessions"],
        async () => new Response(null, { status: 204 }),
      )
    ).status,
    204,
  );
});

test("history merges deduplicate polling records while preserving older tool results", () => {
  const message = (id: string, text: string) => ({
    id,
    text,
    role: "assistant",
    entryId: id.split("-")[0],
    kind: "pi.assistant",
  });
  const merged = mergeMessages(
    [message("1-0", "old"), message("3-0", "answer")],
    [message("2-0", "tool"), message("3-0", "answer")],
  );
  assert.deepEqual(
    merged.map((m) => m.text),
    ["old", "tool", "answer"],
  );
});

test("poll cleanup aborts the read and suppresses stale callbacks", async () => {
  let deliver!: (value: string) => void;
  let signal: AbortSignal | undefined;
  let updates = 0;
  const stop = startPolling({
    interval: 1,
    read: (value) => {
      signal = value;
      return new Promise<string>((resolve) => (deliver = resolve));
    },
    onValue: () => updates++,
    onError: () => updates++,
  });
  stop();
  deliver("late");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(signal?.aborted, true);
  assert.equal(updates, 0);
});

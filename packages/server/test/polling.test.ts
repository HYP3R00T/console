import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { loadProjectTree } from "../../web/src/lib/navigation.ts";
import { startPolling } from "../../web/src/lib/poll.ts";

test("tree loading uses two requests on current servers and falls back for older servers", async (t) => {
  for (const bundled of [true, false]) {
    const requests: string[] = [];
    const conversations = [{ id: "1", name: "Main", status: "idle" }];
    const fetch = t.mock.method(
      globalThis,
      "fetch",
      async (
        url: Parameters<typeof globalThis.fetch>[0],
        options?: RequestInit,
      ) => {
        requests.push(String(url));
        assert.equal(options?.signal?.aborted, false);
        const data = String(url).endsWith("/workspaces")
          ? [{ id: "project" }]
          : String(url).endsWith("/conversations")
            ? conversations
            : [
                {
                  id: "session",
                  status: "idle",
                  ...(bundled ? { conversations } : {}),
                },
                { id: "empty", status: "idle", conversations: [] },
                { id: "damaged", status: "unavailable" },
              ];
        return Response.json(data);
      },
    );
    const tree = await loadProjectTree(
      "machine-a",
      new AbortController().signal,
    );
    assert.deepEqual(tree.conversations, { session: conversations, empty: [] });
    assert.equal(requests.length, bundled ? 2 : 3);
    assert.ok(
      requests.every((url) => url.startsWith("/api/machines/machine-a/api/")),
    );
    fetch.mock.restore();
  }
});

test("tree loading propagates failures rather than presenting an incomplete tree", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ message: "Disconnected" }, { status: 502 }),
  );
  await assert.rejects(
    loadProjectTree("machine-b", new AbortController().signal),
    /Disconnected/,
  );
});

test("polling waits for completion, recovers after errors and stops on cleanup", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finish!: (value: number) => void;
  let calls = 0;
  let signal!: AbortSignal;
  const values: number[] = [];
  const errors: string[] = [];
  const stop = startPolling({
    read: async (current) => {
      signal = current;
      calls++;
      if (calls === 1)
        return new Promise<number>((resolve) => {
          finish = resolve;
        });
      if (calls === 2) throw new Error("Offline");
      return 3;
    },
    onValue: (value) => values.push(value),
    onError: (error) => errors.push(error.message),
    interval: 100,
  });
  t.after(stop);
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  finish(1);
  await setImmediate();
  assert.deepEqual(values, [1]);
  t.mock.timers.tick(99);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.deepEqual(errors, ["Offline"]);
  t.mock.timers.tick(100);
  await setImmediate();
  assert.deepEqual(values, [1, 3]);
  stop();
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(1000);
  assert.equal(calls, 3);
});

test("polling cleanup suppresses late success and failure callbacks", async () => {
  for (const fail of [false, true]) {
    let settle!: () => void;
    let signal!: AbortSignal;
    const stop = startPolling({
      read: (current) => {
        signal = current;
        return new Promise<void>((resolve, reject) => {
          settle = () => (fail ? reject(new Error("late")) : resolve());
        });
      },
      onValue: () => assert.fail("late value after cleanup"),
      onError: () => assert.fail("late error after cleanup"),
      interval: 100,
    });
    stop();
    assert.equal(signal.aborted, true);
    settle();
    await setImmediate();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { BackendRequestError } from "../src/lib/backend/client.ts";
import { localHttpConnector } from "../src/lib/backend/local-http.ts";

test("the local connector probes once and keeps API requests scoped with structured errors", async (t) => {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return Response.json({
        product: "console",
        apiVersion: 1,
        backendId: "11111111-1111-4111-8111-111111111111",
      });
    },
  );
  const client = await localHttpConnector.open(
    "http://localhost:3000",
    new AbortController().signal,
  );
  t.after(() => client.close());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://localhost:3000/v1/connection");
  fetch.mock.mockImplementation(async () => Response.json({ value: 42 }));
  assert.deepEqual(
    await client.request("/v1/projects", {
      method: "POST",
      headers: new Headers({ "X-Test": "preserved" }),
      body: "{}",
    }),
    { value: 42 },
  );
  // The spy still captures calls after replacing its implementation.
  const init = fetch.mock.calls[1].arguments[1] as RequestInit;
  assert.equal(
    new Headers(init.headers).get("Content-Type"),
    "application/json",
  );
  assert.equal(new Headers(init.headers).get("X-Test"), "preserved");
  assert.equal(init.credentials, "omit");
  for (const path of [
    "//elsewhere.test/api",
    "https://elsewhere.test/api",
    "/\\elsewhere.test/api",
  ])
    await assert.rejects(client.request(path), /connected backend/);
  fetch.mock.mockImplementation(async () =>
    Response.json({ error: "Busy", code: "project_busy" }, { status: 409 }),
  );
  await assert.rejects(
    client.request("/v1/projects"),
    (error: unknown) =>
      error instanceof BackendRequestError && error.code === "project_busy",
  );
});

test("closing a client cancels in-flight HTTP, closes streams and suppresses late callbacks", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      product: "console",
      apiVersion: 1,
      backendId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  class Events extends EventTarget {
    static instances: Events[] = [];
    closed = false;
    onerror?: () => void;
    readonly url: string;
    constructor(url: string) {
      super();
      this.url = url;
      Events.instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  Object.defineProperty(globalThis, "EventSource", {
    value: Events,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "EventSource", previous);
    else Reflect.deleteProperty(globalThis, "EventSource");
  });
  const client = await localHttpConnector.open(
    "http://localhost:3000",
    new AbortController().signal,
  );
  t.after(() => client.close());
  const received: string[] = [];
  let reconnects = 0;
  const unsubscribe = client.subscribe("/v1/events", "snapshot", {
    message: (data) => received.push(data),
    reconnecting: () => ++reconnects,
  });
  const events = Events.instances[0];
  assert.equal(events.url, "http://localhost:3000/v1/events");
  events.dispatchEvent(new MessageEvent("snapshot", { data: "one" }));
  events.onerror?.();
  assert.deepEqual(received, ["one"]);
  assert.equal(reconnects, 1);
  unsubscribe();
  events.dispatchEvent(new MessageEvent("snapshot", { data: "late" }));
  assert.deepEqual(received, ["one"]);
  client.subscribe("/v1/events", "snapshot", {
    message: (data) => received.push(data),
    reconnecting: () => ++reconnects,
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        ),
      ),
  );
  const pending = client.request("/v1/projects");
  client.close();
  await assert.rejects(pending, /connection ended/);
  assert.ok(Events.instances.every((stream) => stream.closed));
  Events.instances[1].onerror?.();
  assert.equal(reconnects, 1);
  await assert.rejects(client.request("/v1/projects"), /connection ended/);
});

test("a cancelled connector never publishes a client after a late handshake", async (t) => {
  let complete!: (response: Response) => void;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  const controller = new AbortController();
  const opening = localHttpConnector.open(
    "http://localhost:3000",
    controller.signal,
  );
  controller.abort(new Error("replaced"));
  complete(
    Response.json({
      product: "console",
      apiVersion: 1,
      backendId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  await assert.rejects(opening, /replaced/);
});

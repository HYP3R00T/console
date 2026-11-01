import assert from "node:assert/strict";
import test from "node:test";
import { backendOrigin, checkConnection } from "../src/lib/connection.ts";

test("backend addresses are local-only without URL credentials or extra paths", () => {
  assert.equal(
    backendOrigin(" http://127.0.0.1:3000/ "),
    "http://127.0.0.1:3000",
  );
  assert.equal(backendOrigin("http://localhost:4100"), "http://localhost:4100");
  assert.equal(backendOrigin("http://[::1]:3000"), "http://[::1]:3000");
  assert.equal(
    backendOrigin("https://localhost:3000"),
    "https://localhost:3000",
  );
  for (const value of [
    "127.0.0.1:3000",
    "http://192.168.0.10:3000",
    "https://backend.example.com",
    "ftp://localhost",
    "https://example.com/api",
    "https://example.com/?token=secret",
    "https://user:pass@example.com",
    "https://example.com/#token",
  ]) {
    assert.throws(() => backendOrigin(value));
  }
});

test("a URL-only connection validates the protocol without sending credentials", async (t) => {
  const requests: { url: string; options: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      requests.push({ url, options });
      return Response.json({ product: "console", apiVersion: 1 });
    },
  );
  const result = await checkConnection(
    "http://localhost:3000",
    new AbortController().signal,
  );
  assert.equal(result.origin, "http://localhost:3000");
  assert.ok(result.checkedAt <= Date.now());
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://localhost:3000/v1/connection");
  assert.equal(requests[0]?.options.headers, undefined);
  assert.equal(requests[0]?.options.credentials, "omit");
  assert.equal(requests[0]?.options.redirect, "error");
  assert.equal(requests[0]?.options.cache, "no-store");
});

test("nonlocal addresses are rejected before making a request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({}),
  );
  await assert.rejects(
    checkConnection("https://example.com", new AbortController().signal),
    /loopback/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("HTTP errors, invalid protocol responses and network failures stay distinct", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 401 }),
  );
  const probe = () =>
    checkConnection("http://localhost:3000", new AbortController().signal);
  await assert.rejects(probe(), /HTTP 401/);
  fetch.mock.mockImplementation(async () => Response.json({ status: "ok" }));
  await assert.rejects(probe(), /API version 1/);
  fetch.mock.mockImplementation(async () => new Response("not JSON"));
  await assert.rejects(probe(), /connection response/);
  fetch.mock.mockImplementation(async () => {
    throw new TypeError("network");
  });
  await assert.rejects(probe(), /Could not reach/);
});

test("cancelling a connection aborts the request", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
      });
    },
  );
  const controller = new AbortController();
  const request = checkConnection("http://localhost:3000", controller.signal);
  controller.abort(new Error("cancelled"));
  await assert.rejects(request, /cancelled/);
});

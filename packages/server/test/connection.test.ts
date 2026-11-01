import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.ts";

test("the local connection endpoint needs no credentials and identifies the protocol", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const response = await app.inject("/v1/connection");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { product: "console", apiVersion: 1 });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("the local website origins can read the connection endpoint without cookies", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  for (const origin of ["http://127.0.0.1:3001", "http://localhost:3001"]) {
    const response = await app.inject({
      url: "/v1/connection",
      headers: { origin },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal(
      response.headers["access-control-allow-credentials"],
      undefined,
    );
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/connection",
      headers: { origin, "access-control-request-method": "GET" },
    });
    assert.equal(preflight.statusCode, 204);
  }
});

test("unapproved browser origins are rejected rather than reflected", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  for (const origin of [
    "https://example.com",
    "null",
    "http://localhost:4000",
  ]) {
    const response = await app.inject({
      url: "/v1/connection",
      headers: { origin },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
  }
});

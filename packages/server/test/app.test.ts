import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.ts";

test("GET /health reports that the HTTP server is available", async (t) => {
  const app = createApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("unimplemented routes return 404", async (t) => {
  const app = createApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/sessions" });

  assert.equal(response.statusCode, 404);
});

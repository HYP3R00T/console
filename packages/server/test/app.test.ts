import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.ts";

test("health responds and former application routes are absent", async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });
  const removed = await app.inject({ method: "GET", url: "/v1/projects" });
  assert.equal(removed.statusCode, 404);
});

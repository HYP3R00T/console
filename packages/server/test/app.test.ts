import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.ts";

test("GET /health reports that the HTTP server is available", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-http-"));
  const app = createApp({}, { dataDirectory: directory });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("unimplemented routes return 404", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-http-"));
  const app = createApp({}, { dataDirectory: directory });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });

  const response = await app.inject({ method: "GET", url: "/sessions" });

  assert.equal(response.statusCode, 404);
});

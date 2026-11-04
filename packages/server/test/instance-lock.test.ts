import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claimInstance } from "../src/storage/instance-lock.ts";
import { fixture } from "./support/harness-fixture.ts";

test("production instance lock rejects a competitor and releases after process death", {
  timeout: 10000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-instance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const url = new URL("../src/storage/instance-lock.ts", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {claimInstance} from ${JSON.stringify(url)}; const release = claimInstance(${JSON.stringify(directory)}); process.send('ready'); setInterval(() => { if (typeof release !== 'function') process.exit(1); },1000);`,
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  t.after(() => child.kill("SIGKILL"));
  await Promise.race([
    EventEmitter.once(child, "message"),
    EventEmitter.once(child, "exit").then(() => {
      throw new Error("Lock child exited before ready");
    }),
  ]);
  assert.throws(() => claimInstance(directory), /already running/);
  const exited = EventEmitter.once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  const release = claimInstance(directory);
  release();
  release();
  claimInstance(directory)();
});

test("handshake installation identity survives reopening backend storage", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const first = (await f.app.inject("/v1/connection")).json().backendId;
  assert.equal(first, f.providers.store.installationId());
  await f.app.close();
  f = await fixture(directory);
  assert.equal((await f.app.inject("/v1/connection")).json().backendId, first);
});

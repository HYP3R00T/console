import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveConfiguration,
  startupArguments,
} from "../src/platform/configuration.ts";

test("standalone startup has complete defaults and accepts explicit CLI overrides", () => {
  const defaults = startupArguments([]);
  assert.equal(defaults.port, 3000);
  assert.equal(
    defaults.directory,
    join(homedir(), ".local", "share", "console"),
  );
  assert.equal(defaults.help, false);
  assert.deepEqual(
    startupArguments(["--port", "3100", "--data-dir", "/tmp/console-explicit"]),
    { port: 3100, directory: "/tmp/console-explicit", help: false },
  );
  assert.equal(startupArguments(["--port", "0"]).port, 0);
  assert.equal(startupArguments(["-h"]).help, true);
});

test("startup rejects malformed ports, unknown options and relative storage", () => {
  for (const value of ["-1", "65536", "3.5", "abc", "1e3", ""])
    assert.throws(() => startupArguments(["--port", value]));
  assert.throws(() => startupArguments(["--unknown"]));
  assert.throws(() => startupArguments(["unexpected"]));
  assert.throws(
    () => startupArguments(["--data-dir", "relative/path"]),
    /absolute/,
  );
  assert.throws(
    () => resolveConfiguration({ dataDirectory: "relative" }),
    /absolute/,
  );
});

test("standalone help works without opening a backend or provider login", () => {
  const text = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("../src/main.ts", import.meta.url)), "--help"],
    { encoding: "utf8" },
  );
  assert.match(text, /Console backend/);
  assert.match(text, /--data-dir/);
  assert.match(text, /No environment file/);
});

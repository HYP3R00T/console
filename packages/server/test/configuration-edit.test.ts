import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "./support/harness-fixture.ts";

const server = {
  command: process.execPath,
  args: ["-e", "process.exit(0)"],
  env: ["PATH"],
  tools: [],
};
const ssh = {
  host: "example.invalid",
  hostKeyAlias: "fixture",
  knownHostsFile: "/tmp/known-hosts",
  cwd: "/workspace",
};

test("machine configuration edits persist owner-only files, serialize competing saves and reload catalogs", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-config-edit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  for (const [kind, file, configuration] of [
    ["mcp", "mcp.json", { servers: { fixture: server } }],
    ["ssh", "execution.json", { profiles: { fixture: ssh } }],
  ] as const) {
    const url = `/v1/machine/configuration/${kind}`;
    const initial = (await f.app.inject(url)).json();
    assert.equal(initial.revision, "missing");
    const responses = await Promise.all(
      [0, 1].map(() =>
        f.app.inject({
          method: "PUT",
          url,
          payload: { revision: initial.revision, configuration },
        }),
      ),
    );
    assert.deepEqual(
      responses.map((response) => response.statusCode).sort(),
      [200, 409],
    );
    const saved = responses
      .find((response) => response.statusCode === 200)!
      .json();
    assert.equal(saved.invalid, false);
    assert.deepEqual(saved.configuration, configuration);
    const path = join(directory, file);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), configuration);
    if (kind === "mcp")
      assert.equal(f.service.runtime.mcp.status().servers[0]?.name, "fixture");
    else
      assert.deepEqual(f.service.runtime.remote.status().profiles, ["fixture"]);
  }
  await f.app.close();
  f = await fixture(directory);
  assert.deepEqual(
    (await f.app.inject("/v1/machine/configuration/ssh")).json().configuration,
    { profiles: { fixture: ssh } },
  );
  const url = "/v1/machine/configuration/mcp";
  const before = (await f.app.inject(url)).json();
  const removed = await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: before.revision, configuration: { servers: {} } },
  });
  assert.equal(removed.statusCode, 200, removed.body);
  assert.deepEqual(f.service.runtime.mcp.status().servers, []);
});

test("invalid configuration and manual edits cannot overwrite the current file; malformed JSON can be repaired", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-config-invalid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const url = "/v1/machine/configuration/mcp";
  const path = join(directory, "mcp.json");
  const bytes = JSON.stringify({ servers: {} });
  await writeFile(path, bytes, { mode: 0o600 });
  const snapshot = (await f.app.inject(url)).json();
  for (const configuration of [
    { servers: { fixture: { command: "relative" } } },
    { servers: { fixture: { ...server, args: ["bad\0arg"] } } },
    { servers: { fixture: { ...server, env: ["SECRET=value"] } } },
    { servers: { fixture: { ...server, unknown: true } } },
    {
      servers: Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [`server-${index}`, server]),
      ),
    },
  ]) {
    const response = await f.app.inject({
      method: "PUT",
      url,
      payload: { revision: snapshot.revision, configuration },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(await readFile(path, "utf8"), bytes);
  }
  await writeFile(path, `${bytes}\n`);
  const stale = await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: snapshot.revision, configuration: { servers: {} } },
  });
  assert.equal(stale.statusCode, 409);
  await writeFile(path, "invalid JSON with private content");
  const malformed = await f.app.inject(url);
  assert.equal(malformed.json().invalid, true);
  assert.equal(malformed.json().configuration, null);
  assert.ok(!malformed.body.includes("private content"));
  const repaired = await f.app.inject({
    method: "PUT",
    url,
    payload: {
      revision: malformed.json().revision,
      configuration: { servers: {} },
    },
  });
  assert.equal(repaired.statusCode, 200, repaired.body);
  assert.equal(repaired.json().invalid, false);
});

test("configuration editing rejects unsafe files, links, excessive sizes and invalid SSH targets", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-config-safety-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const url = "/v1/machine/configuration/ssh";
  const path = join(directory, "execution.json");
  for (const entry of [
    { ...ssh, port: 0 },
    { ...ssh, knownHostsFile: "relative" },
    { ...ssh, cwd: "relative" },
    { ...ssh, host: "-oProxyCommand=bad" },
    { ...ssh, unknown: true },
  ]) {
    const response = await f.app.inject({
      method: "PUT",
      url,
      payload: {
        revision: "missing",
        configuration: { profiles: { fixture: entry } },
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  }
  await writeFile(path, JSON.stringify({ profiles: {} }), { mode: 0o600 });
  await chmod(path, 0o644);
  assert.equal((await f.app.inject(url)).statusCode, 400);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: { revision: "missing", configuration: { profiles: {} } },
      })
    ).statusCode,
    400,
  );
  await rm(path);
  const target = join(directory, "target.json");
  await writeFile(target, "private", { mode: 0o600 });
  await symlink(target, path);
  assert.equal((await f.app.inject(url)).statusCode, 400);
  assert.equal(await readFile(target, "utf8"), "private");
  await rm(path);
  await writeFile(path, " ".repeat(65537), { mode: 0o600 });
  assert.equal((await f.app.inject(url)).statusCode, 400);
});

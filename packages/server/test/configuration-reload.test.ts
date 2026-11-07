import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { RemoteWorkspaces } from "../src/execution/remote-workspaces.ts";
import { McpTools } from "../src/harnesses/mcp-tools.ts";

const script = `
import {createInterface} from 'node:readline';
for await (const line of createInterface({input:process.stdin})) {
 const {id,method,params}=JSON.parse(line); if(id===undefined) continue;
 const result=method==='initialize'?{protocolVersion:params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{tools:[{name:'echo',inputSchema:{type:'object',properties:{}}}]};
 console.log(JSON.stringify({jsonrpc:'2.0',id,result}));
}`;

test("MCP reload replaces connections and tools, serializes reloads and fails closed on invalid configuration", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-mcp-reload-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "mcp.json");
  const manager = new McpTools(path);
  t.after(() => manager.close());
  await manager.start();
  const save = async (name: string) =>
    writeFile(
      path,
      JSON.stringify({
        servers: {
          [name]: {
            command: process.execPath,
            args: ["--input-type=module", "-e", script],
          },
        },
      }),
      { mode: 0o600 },
    );
  await save("first");
  let publications = 0;
  manager.subscribe(() => publications++);
  await manager.reload();
  assert.deepEqual(manager.status(), {
    invalid: false,
    servers: [{ name: "first", connected: true, tools: 1 }],
  });
  await save("second");
  await Promise.all([manager.reload(), manager.reload()]);
  assert.deepEqual(manager.status(), {
    invalid: false,
    servers: [{ name: "second", connected: true, tools: 1 }],
  });
  assert.ok(
    !manager.extension().tools?.some((tool) => tool.name.includes("first")),
  );
  await writeFile(path, "invalid");
  await manager.reload();
  assert.deepEqual(manager.status(), { invalid: true, servers: [] });
  await rm(path);
  await manager.reload();
  assert.deepEqual(manager.status(), { invalid: false, servers: [] });
  assert.ok(publications >= 8);
});

test("SSH reload replaces available profiles and removes stale definitions after malformed or missing files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-ssh-reload-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "execution.json");
  const manager = new RemoteWorkspaces(path);
  t.after(() => manager.close());
  const save = async (name: string) =>
    writeFile(
      path,
      JSON.stringify({
        profiles: {
          [name]: {
            host: "example.invalid",
            hostKeyAlias: "fixture",
            knownHostsFile: join(directory, "known-hosts"),
            cwd: "/workspace",
          },
        },
      }),
      { mode: 0o600 },
    );
  await save("first");
  await manager.start();
  assert.deepEqual(manager.status(), { invalid: false, profiles: ["first"] });
  await save("second");
  await Promise.all([manager.reload(), manager.reload()]);
  assert.deepEqual(manager.status(), { invalid: false, profiles: ["second"] });
  await assert.rejects(manager.environment("first", context), /unavailable/);
  await writeFile(path, "invalid");
  await manager.reload();
  assert.deepEqual(manager.status(), { invalid: true, profiles: [] });
  await assert.rejects(manager.environment("second", context), /unavailable/);
  await rm(path);
  await manager.reload();
  assert.deepEqual(manager.status(), { invalid: false, profiles: [] });
});

test("reload routes validate conversation scope before changing backend configuration", async (t) => {
  const { fixture } = await import("./support/harness-fixture.ts");
  const directory = await mkdtemp(join(tmpdir(), "console-reload-api-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  for (const [kind, file] of [
    ["mcp", "mcp.json"],
    ["remote", "execution.json"],
  ] as const) {
    await writeFile(join(directory, file), "invalid", { mode: 0o600 });
    const invalid = await f.app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionId}/conversations/999999/${kind}/reload`,
      payload: {},
    });
    assert.equal(invalid.statusCode, 404);
    assert.equal(f.service.runtime[kind].status().invalid, false);
    const response = await f.app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionId}/conversations/${root.id}/${kind}/reload`,
      payload: {},
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().invalid, true);
  }
});

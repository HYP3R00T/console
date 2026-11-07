import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { defineTask, ToolResultEntry } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

const url = "/v1/machine/configuration/extensions";
const source = (value: string, gate?: string) => `
import {readFile,writeFile} from 'node:fs/promises';
export default ({defineExtension,defineTool,defineTask}) => defineExtension({
 name:'user.fixture',
 tools:[defineTool({name:'user_fixture_version',description:'Report the installed version',parameters:{type:'object',properties:{}},
 execute:async()=>{
 ${
   gate
     ? `await writeFile(${JSON.stringify(`${gate}-started`)},'yes');
 while(true){try{await readFile(${JSON.stringify(gate)});break}catch{await new Promise(r=>setTimeout(r,10))}}`
     : ""
 }
 return {output:[{type:'text',text:${JSON.stringify(value)}}]};
 }})],
 tasks:[defineTask({name:'user.fixture.work',version:1,initial:()=>({phase:'run'}),phases:{
 run:(_task,runtime,ctx)=>runtime.commit(()=>({status:'terminal',outcome:{status:'completed',result:${JSON.stringify(value)}}}),ctx)
 },abort:(_task,runtime,ctx)=>runtime.commit(()=>({status:'terminal',outcome:{status:'aborted'}}),ctx)})]
});`;
async function bundle(directory: string, text: string) {
  await mkdir(join(directory, "extensions"), { mode: 0o700, recursive: true });
  await writeFile(join(directory, "extensions", "fixture.mjs"), text, {
    mode: 0o600,
  });
  return {
    extensions: [
      {
        name: "user.fixture",
        module: "fixture.mjs",
        sha256: createHash("sha256").update(text).digest("hex"),
      },
    ],
  };
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 250; i++) {
    if (await check()) return;
    await setTimeout(20);
  }
  throw new Error("Condition did not become true");
}

test("managed extensions replace future calls while running calls finish on old code, and selections survive removal and restart", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-extensions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const gate = join(directory, "release");
  const v1 = await bundle(directory, source("version one", gate));
  const installed = await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: "missing", configuration: v1 },
  });
  assert.equal(installed.statusCode, 200, installed.body);
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  let root = await harness.root(context);
  assert.ok(
    !(await root.agent(context)).tools.some(
      (tool) => tool.name === "user_fixture_version",
    ),
  );
  await root.configure(
    {
      model: { provider: "test", modelId: "test-model" },
    },
    context,
  );
  const configurationPath = `/v1/sessions/${sessionId}/conversations/${root.id}/configuration`;
  const selected = await f.app.inject({
    method: "PATCH",
    url: configurationPath,
    payload: {
      revision: (await f.app.inject(configurationPath)).json().revision,
      managedExtensions: ["user.fixture"],
    },
  });
  assert.equal(selected.statusCode, 200, selected.body);
  const call = () =>
    fauxAssistantMessage(fauxToolCall("user_fixture_version", {}), {
      stopReason: "toolUse",
    });
  f.faux.setResponses([
    call(),
    fauxAssistantMessage("done"),
    call(),
    fauxAssistantMessage("done"),
  ]);
  const first = await root.submit(
    { type: "input", content: "version" },
    context,
  );
  await until(async () =>
    readFile(`${gate}-started`).then(
      () => true,
      () => false,
    ),
  );
  const busyChange = await f.app.inject({
    method: "PATCH",
    url: configurationPath,
    payload: { revision: selected.json().revision, managedExtensions: [] },
  });
  assert.equal(busyChange.statusCode, 409);
  const v2 = await bundle(directory, source("version two"));
  const replaced = await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: installed.json().revision, configuration: v2 },
  });
  assert.equal(replaced.statusCode, 200, replaced.body);
  await writeFile(gate, "continue");
  await first.wait(context);
  await (
    await root.submit({ type: "input", content: "version again" }, context)
  ).wait(context);
  const results = (
    await root.entries({ order: "ascending" }, 100, undefined, context)
  ).items.filter(ToolResultEntry.is);
  assert.match(JSON.stringify(results[0]), /version one/);
  assert.match(JSON.stringify(results[1]), /version two/);
  assert.match(
    (
      await f.app.inject(
        `/v1/sessions/${sessionId}/conversations/${root.id}/history`,
      )
    ).body,
    /version two/,
  );
  const removed = await f.app.inject({
    method: "PUT",
    url,
    payload: {
      revision: replaced.json().revision,
      configuration: { extensions: [] },
    },
  });
  assert.equal(removed.statusCode, 200, removed.body);
  assert.match(
    (
      await f.app.inject(
        `/v1/sessions/${sessionId}/conversations/${root.id}/history`,
      )
    ).body,
    /version one/,
  );
  assert.ok(
    !(await root.agent(context)).tools.some(
      (tool) => tool.name === "user_fixture_version",
    ),
  );
  await f.app.close();
  f = await fixture(directory);
  ({ harness } = await f.service.session(sessionId));
  root = await harness.root(context);
  const restored = await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: removed.json().revision, configuration: v2 },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.ok(
    (await root.agent(context)).tools.some(
      (tool) => tool.name === "user_fixture_version",
    ),
  );
});

test("pinned bundle failures leave the backend available and restoring definitions wakes blocked work after restart", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-extension-recovery-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const text = source("restored");
  const config = await bundle(directory, text);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: { revision: "missing", configuration: config },
      })
    ).statusCode,
    200,
  );
  const { sessionId } = await f.service.createStandalone();
  await f.app.close();
  await writeFile(
    join(directory, "extensions", "fixture.mjs"),
    source("unapproved change"),
  );
  f = await fixture(directory);
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const status = (await f.app.inject(url)).json();
  assert.ok(status.problem);
  assert.deepEqual(status.installed, []);
  const token = defineTask<null, { phase: "run" }, string>({
    name: "user.fixture.work",
    version: 2,
    initial: () => ({ phase: "run" }),
    phases: {
      run: async () => {
        throw new Error("Must resolve installed definition");
      },
    },
    abort: async () => {},
  });
  const id = await root.commit(
    (tx) => tx.createTask(token, null, { ownership: { kind: "conversation" } }),
    context,
  );
  harness.resume();
  const watch = await harness.watchTaskGraph(context);
  t.after(() => watch.stop());
  await until(async () => watch.value.tasks[id]?.blocked === "missing_task");
  await watch.stop();
  await f.app.close();
  f = await fixture(directory);
  const reopened = await f.service.session(sessionId);
  const recoveredWatch = await reopened.harness.watchTaskGraph(context);
  t.after(() => recoveredWatch.stop());
  recoveredWatch.start(async () => {});
  await bundle(directory, text);
  const reloaded = await f.app.inject({
    method: "POST",
    url: "/v1/machine/extensions/reload",
    payload: {},
  });
  assert.equal(reloaded.statusCode, 200, reloaded.body);
  await until(
    async () => recoveredWatch.value.tasks[id]?.blocked === "task_too_old",
  );
  const compatible = await bundle(
    directory,
    text.replace("version:1", "version:2"),
  );
  const upgraded = await f.app.inject({
    method: "PUT",
    url,
    payload: { revision: reloaded.json().revision, configuration: compatible },
  });
  assert.equal(upgraded.statusCode, 200, upgraded.body);
  const settled = await reopened.harness.waitForTask(id, context);
  assert.equal(settled.state.outcome.result, "restored");
  await recoveredWatch.stop();
});

test("extension admission rejects stale hashes, unsafe bundles and invalid identities without changing the installed manifest", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-extension-validation-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const configuration = await bundle(directory, source("valid"));
  const save = (revision: string, configuration: unknown) =>
    f.app.inject({ method: "PUT", url, payload: { revision, configuration } });
  const installed = await save("missing", configuration);
  assert.equal(installed.statusCode, 200, installed.body);
  const revision = installed.json().revision;
  assert.equal((await save("missing", configuration)).statusCode, 409);
  assert.equal(
    (
      await save(revision, {
        extensions: [
          { ...configuration.extensions[0], name: "console.review" },
        ],
      })
    ).statusCode,
    400,
  );
  await writeFile(
    join(directory, "extensions", "fixture.mjs"),
    source("changed"),
  );
  assert.equal((await save(revision, configuration)).statusCode, 400);
  assert.deepEqual(
    (await f.app.inject(url)).json().configuration,
    configuration,
  );
  assert.equal(
    (await f.app.inject(url)).json().installed[0].name,
    "user.fixture",
  );
  assert.equal(
    (await f.app.inject(url)).json().installed[0].sha256,
    configuration.extensions[0]?.sha256,
  );
  const updated = await bundle(directory, source("changed"));
  await chmod(join(directory, "extensions", "fixture.mjs"), 0o644);
  assert.equal((await save(revision, updated)).statusCode, 400);
  await chmod(join(directory, "extensions", "fixture.mjs"), 0o600);
  await symlink(
    join(directory, "extensions", "fixture.mjs"),
    join(directory, "extensions", "linked.mjs"),
  );
  const candidates = (
    await f.app.inject("/v1/machine/extensions/candidates")
  ).json();
  assert.equal(
    candidates.modules.find(
      (item: { module: string }) => item.module === "linked.mjs",
    ).unavailable,
    true,
  );
  assert.equal(
    candidates.modules.find(
      (item: { module: string }) => item.module === "fixture.mjs",
    ).sha256,
    updated.extensions[0]?.sha256,
  );
  const bad = await bundle(
    directory,
    "export default () => ({name:'user.other'});",
  );
  assert.equal((await save(revision, bad)).statusCode, 400);
  assert.deepEqual(
    (await f.app.inject(url)).json().configuration,
    configuration,
  );
});

test("conversation extension selection preserves tool policy, suspends in Plan mode and checks opaque hook effects", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-extension-selection-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const configuration = await bundle(directory, source("selected"));
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: { revision: "missing", configuration },
      })
    ).statusCode,
    200,
  );
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  let root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const path = `/v1/sessions/${sessionId}/conversations/${root.id}/configuration`;
  const change = async (value: Record<string, unknown>) =>
    f.app.inject({
      method: "PATCH",
      url: path,
      payload: {
        revision: (await f.app.inject(path)).json().revision,
        ...value,
      },
    });
  assert.equal(
    (await change({ managedExtensions: ["user.missing"] })).statusCode,
    409,
  );
  assert.equal((await change({ tools: ["read"] })).statusCode, 200);
  const selected = await change({ managedExtensions: ["user.fixture"] });
  assert.equal(selected.statusCode, 200, selected.body);
  assert.deepEqual(selected.json().managedExtensions.selected, [
    "user.fixture",
  ]);
  assert.equal(
    selected
      .json()
      .tools.find(
        (tool: { name: string }) => tool.name === "user_fixture_version",
      ).enabled,
    false,
  );
  assert.deepEqual(
    (await root.agent(context)).tools.map((tool) => tool.name),
    ["read"],
  );
  assert.equal((await change({ sandbox: true })).statusCode, 409);
  assert.equal((await change({ remoteProfile: "missing" })).statusCode, 409);
  const plan = await change({ planMode: true });
  assert.equal(plan.statusCode, 200, plan.body);
  assert.equal(plan.json().managedExtensions.suspended, true);
  assert.ok(
    !(await root.agent(context)).extensions.some(
      (extension) => extension.name === "user.fixture",
    ),
  );
  assert.equal((await change({ managedExtensions: [] })).statusCode, 409);
  assert.equal((await change({ planMode: false })).statusCode, 200);
  assert.ok(
    (await root.agent(context)).extensions.some(
      (extension) => extension.name === "user.fixture",
    ),
  );
  assert.equal(
    (await change({ postRunCommand: "printf extension-checked" })).statusCode,
    200,
  );
  f.faux.setResponses([fauxAssistantMessage("Answer without tool calls")]);
  await (await root.submit({ type: "input", content: "Answer" }, context)).wait(
    context,
  );
  await harness.waitForIdle(context);
  const entries = (await root.entries({}, 100, undefined, context)).items;
  assert.match(
    JSON.stringify(
      entries.find((entry) => entry.kind === "console.post-run-check"),
    ),
    /extension-checked/,
  );
  const before = (await f.app.inject(path)).json();
  const manifest = (await f.app.inject(url)).json();
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url,
        payload: {
          revision: manifest.revision,
          configuration: { extensions: [] },
        },
      })
    ).statusCode,
    200,
  );
  const stale = await f.app.inject({
    method: "PATCH",
    url: path,
    payload: { revision: before.revision, managedExtensions: [] },
  });
  assert.equal(stale.statusCode, 409);
  await f.app.close();
  f = await fixture(directory);
  ({ harness } = await f.service.session(sessionId));
  root = await harness.root(context);
  const unavailable = (await f.app.inject(path)).json();
  assert.deepEqual(unavailable.managedExtensions.selected, ["user.fixture"]);
  assert.deepEqual(unavailable.managedExtensions.installed, []);
  assert.equal((await change({ managedExtensions: [] })).statusCode, 200);
  assert.deepEqual(
    (await f.app.inject(path)).json().managedExtensions.selected,
    [],
  );
});

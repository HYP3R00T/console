import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import {
  consoleRoot,
  defaultSandbox,
  type SandboxPolicy,
  validateSandbox,
} from "../src/sandbox/policy.ts";
import { runSandbox, sandboxSupport } from "../src/sandbox/runner.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "console-sandbox-"));
  t.after(() => rm(root, { recursive: true }));
  const workspace = join(root, "workspace");
  const data = join(root, "private");
  const extra = join(root, "extra");
  await Promise.all([workspace, data, extra].map((path) => mkdir(path)));
  await writeFile(join(workspace, "input.txt"), "inside");
  await writeFile(join(data, "secret.txt"), "private");
  await writeFile(join(extra, "extra.txt"), "extra");
  const policy: SandboxPolicy = {
    ...defaultSandbox(),
    enabled: true,
    workspace,
  };
  return { root, workspace, data, extra, policy };
}

async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let n = 0; n < 200; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected sandbox state did not arrive");
}

test("native sandbox enforces read, write, private-path and symlink boundaries", async (t) => {
  const { workspace, data, extra, policy } = await fixture(t);
  assert.equal(
    (await sandboxSupport()).available,
    true,
    "Install pinned nono with mise install before running native tests",
  );
  assert.equal(
    await runSandbox(policy, { operation: "read", path: "input.txt" }, data),
    "inside",
  );
  await assert.rejects(
    runSandbox(
      policy,
      { operation: "write", path: "input.txt", content: "changed" },
      data,
    ),
    /EACCES|EPERM/,
  );
  await assert.rejects(
    runSandbox(
      policy,
      { operation: "read", path: join(data, "secret.txt") },
      data,
    ),
    /EACCES|EPERM/,
  );
  await symlink(join(data, "secret.txt"), join(workspace, "escape.txt"));
  await assert.rejects(
    runSandbox(policy, { operation: "read", path: "escape.txt" }, data),
    /EACCES|EPERM/,
  );
  assert.equal(
    await runSandbox(
      { ...policy, readPaths: [extra] },
      { operation: "read", path: join(extra, "extra.txt") },
      data,
    ),
    "extra",
  );
  await runSandbox(
    { ...policy, writePaths: [extra] },
    { operation: "write", path: join(extra, "new.txt"), content: "permitted" },
    data,
  );
  assert.equal(await readFile(join(extra, "new.txt"), "utf8"), "permitted");
  assert.equal(await readFile(join(workspace, "input.txt"), "utf8"), "inside");
});

test("native sandbox blocks both TCP and UDP, while explicit network permission works", async (t) => {
  const { policy, data } = await fixture(t);
  const tcp = createServer((socket) => socket.end());
  const udp = createSocket("udp4");
  await new Promise<void>((accept, reject) => {
    tcp.once("error", reject);
    tcp.listen(0, "127.0.0.1", accept);
  });
  t.after(() => new Promise<void>((accept) => tcp.close(() => accept())));
  await new Promise<void>((accept, reject) => {
    udp.once("error", reject);
    udp.bind(0, "127.0.0.1", accept);
  });
  t.after(() => new Promise<void>((accept) => udp.close(() => accept())));
  const address = tcp.address();
  assert.ok(address && typeof address !== "string");
  for (const [protocol, port] of [
    ["tcp", address.port],
    ["udp", udp.address().port],
  ] as const) {
    await assert.rejects(
      runSandbox(policy, { operation: "probe-network", protocol, port }, data),
      /EACCES|EPERM/,
    );
    assert.equal(
      await runSandbox(
        { ...policy, network: "unrestricted" },
        { operation: "probe-network", protocol, port },
        data,
      ),
      "connected",
    );
  }
  const http = createHttpServer((_request, response) =>
    response.end("sandbox response"),
  );
  await new Promise<void>((accept, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", accept);
  });
  t.after(() => new Promise<void>((accept) => http.close(() => accept())));
  const httpAddress = http.address();
  assert.ok(httpAddress && typeof httpAddress !== "string");
  assert.equal(
    await runSandbox(
      { ...policy, network: "unrestricted" },
      { operation: "fetch", url: `http://127.0.0.1:${httpAddress.port}/` },
      data,
    ),
    "sandbox response",
  );
});

test("policy validation protects control storage and fails closed without nono", async (t) => {
  const { root, data, workspace, policy } = await fixture(t);
  await assert.rejects(
    validateSandbox({ ...policy, workspace: "relative" }, data),
    /absolute/,
  );
  await assert.rejects(
    validateSandbox({ ...policy, readPaths: [root] }, data),
    /private storage/,
  );
  await assert.rejects(
    validateSandbox(
      { ...policy, writePaths: [join(consoleRoot, "packages/server")] },
      data,
    ),
    /source and runtime/,
  );
  await symlink(data, join(workspace, "private-link"));
  await assert.rejects(
    validateSandbox(
      { ...policy, readPaths: [join(workspace, "private-link")] },
      data,
    ),
    /private storage/,
  );
  await assert.rejects(
    runSandbox({ ...policy, enabled: false }, { operation: "check" }, data),
    /disabled/,
  );
  const previous = process.env.CONSOLE_NONO_BIN;
  try {
    process.env.CONSOLE_NONO_BIN = join(root, "missing-nono");
    assert.equal((await sandboxSupport()).available, false);
    await assert.rejects(
      runSandbox(policy, { operation: "read", path: "input.txt" }, data),
      /no unconfined fallback/,
    );
  } finally {
    if (previous === undefined) delete process.env.CONSOLE_NONO_BIN;
    else process.env.CONSOLE_NONO_BIN = previous;
  }
});

test("saved sandbox policy drives real Pi tools and survives backend restart", async (t) => {
  const { data, workspace, policy } = await fixture(t);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let app = createApp({}, { dataDirectory: data, models: () => models });
  t.after(() => app.close());
  const headers = { "x-console-request": "1" };
  const id = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: {
        name: "Sandbox",
        requestId: "sandbox",
        workspaceId: (
          await app.inject({
            method: "POST",
            url: "/v1/workspaces",
            headers,
            payload: { name: "Fixture", path: workspace, requestId: "fixture" },
          })
        ).json().id,
      },
    })
  ).json().id;
  const endpoint = `/v1/sessions/${id}`;
  await app.inject({
    method: "PATCH",
    url: `${endpoint}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  assert.equal((await app.inject(endpoint)).json().sandbox.enabled, false);
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${endpoint}/sandbox`,
        headers,
        payload: policy,
      })
    ).statusCode,
    200,
  );
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_file", { path: "input.txt" }), {
      stopReason: "toolUse",
    }),
    (context) => {
      const result = context.messages.at(-1);
      assert.equal(result?.role, "toolResult");
      assert.ok(JSON.stringify(result).includes("inside"));
      return fauxAssistantMessage("Read completed");
    },
  ]);
  await app.inject({
    method: "POST",
    url: `${endpoint}/messages`,
    headers,
    payload: { text: "Read input.txt", requestId: "read" },
  });
  const done = await until(
    async () => (await app.inject(endpoint)).json(),
    (value) => value.outcome === "done",
  );
  assert.equal(
    done.messages.find(
      (message: { role: string }) => message.role === "toolResult",
    ).toolName,
    "read_file",
  );
  // Even with an explicit write grant, arguments to a replay-safe read cannot change its operation.
  await app.inject({
    method: "PATCH",
    url: `${endpoint}/sandbox`,
    headers,
    payload: { ...policy, writePaths: [workspace] },
  });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("read_file", {
        path: "input.txt",
        operation: "write",
        content: "tampered",
      }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && result.isError);
      return fauxAssistantMessage("Invalid arguments rejected");
    },
  ]);
  await app.inject({
    method: "POST",
    url: `${endpoint}/messages`,
    headers,
    payload: { text: "Invalid operation test", requestId: "invalid" },
  });
  await until(
    async () => (await app.inject(endpoint)).json(),
    (value) => value.messages.at(-1)?.text === "Invalid arguments rejected",
  );
  assert.equal(await readFile(join(workspace, "input.txt"), "utf8"), "inside");
  await app.close();
  app = createApp({}, { dataDirectory: data, models: () => models });
  const restored = (await app.inject(endpoint)).json();
  assert.equal(restored.sandbox.enabled, true);
  assert.deepEqual(restored.sandbox.writePaths, [workspace]);
  const previousBinary = process.env.CONSOLE_NONO_BIN;
  try {
    process.env.CONSOLE_NONO_BIN = join(data, "missing-nono");
    const failed = await app.inject({
      method: "PATCH",
      url: `${endpoint}/sandbox`,
      headers,
      payload: policy,
    });
    assert.equal(failed.statusCode, 400);
    assert.deepEqual((await app.inject(endpoint)).json().sandbox.writePaths, [
      workspace,
    ]);
  } finally {
    if (previousBinary === undefined) delete process.env.CONSOLE_NONO_BIN;
    else process.env.CONSOLE_NONO_BIN = previousBinary;
  }
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("write_file", {
        path: "input.txt",
        content: "permitted update",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Write completed"),
  ]);
  await app.inject({
    method: "POST",
    url: `${endpoint}/messages`,
    headers,
    payload: { text: "Write input.txt", requestId: "write" },
  });
  await until(
    async () => (await app.inject(endpoint)).json(),
    (value) => value.messages.at(-1)?.text === "Write completed",
  );
  assert.equal(
    await readFile(join(workspace, "input.txt"), "utf8"),
    "permitted update",
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${endpoint}/sandbox`,
        headers,
        payload: { ...policy, enabled: false },
      })
    ).statusCode,
    200,
  );
});

test("Pi can inspect a workspace and create a nested project through sandboxed tools", async (t) => {
  const { data, workspace, policy } = await fixture(t);
  await assert.rejects(
    runSandbox(policy, { operation: "mkdir", path: "denied/child" }, data),
  );
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const app = createApp({}, { dataDirectory: data, models: () => models });
  t.after(() => app.close());
  const headers = { "x-console-request": "1" };
  const id = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: {
        name: "Scaffold",
        requestId: "scaffold",
        workspaceId: (
          await app.inject({
            method: "POST",
            url: "/v1/workspaces",
            headers,
            payload: { name: "Fixture", path: workspace, requestId: "fixture" },
          })
        ).json().id,
      },
    })
  ).json().id;
  const endpoint = `/v1/sessions/${id}`;
  await app.inject({
    method: "PATCH",
    url: `${endpoint}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${endpoint}/sandbox`,
        headers,
        payload: { ...policy, writePaths: [workspace] },
      })
    ).statusCode,
    200,
  );
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("list_directory", { path: "." }), {
      stopReason: "toolUse",
    }),
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && !result.isError);
      assert.match(JSON.stringify(result), /input.txt/);
      return fauxAssistantMessage(
        fauxToolCall("create_directory", { path: "project/src" }),
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && !result.isError);
      return fauxAssistantMessage(
        fauxToolCall("write_file", {
          path: "project/src/index.ts",
          content: "export const ready = true;\n",
        }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage("Created the project structure."),
  ]);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${endpoint}/messages`,
        headers,
        payload: {
          text: "Inspect and create a small project",
          requestId: "build",
        },
      })
    ).statusCode,
    202,
  );
  const done = await until(
    async () => (await app.inject(endpoint)).json(),
    (value) => value.messages.at(-1)?.text === "Created the project structure.",
  );
  assert.deepEqual(
    done.messages
      .filter((message: { role: string }) => message.role === "toolResult")
      .map((message: { toolName: string }) => message.toolName),
    ["list_directory", "create_directory", "write_file"],
  );
  assert.equal(
    await readFile(join(workspace, "project/src/index.ts"), "utf8"),
    "export const ready = true;\n",
  );
  assert.equal(done.workspace, workspace);
  assert.ok(
    done.enabledTools.some((name: string) => name.includes("list_directory")),
  );
  await assert.rejects(
    runSandbox(
      { ...policy, writePaths: [workspace] },
      { operation: "mkdir", path: "../private/forbidden" },
      data,
    ),
  );
});

test("opt-in shell commands enforce workspace writes, private paths, and network policy", async (t) => {
  const { policy, data, workspace } = await fixture(t);
  await assert.rejects(
    runSandbox(policy, { operation: "command", command: "true" }, data),
    /disabled/,
  );
  const allowed = { ...policy, commands: true, writePaths: [workspace] };
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({
      name: "sandbox-setup-fixture",
      private: true,
      version: "0.0.0",
    }),
  );
  const result = JSON.parse(
    await runSandbox(
      allowed,
      {
        operation: "command",
        command:
          "mkdir -p generated && printf hello > generated/file.txt && node --version && pnpm --version && pnpm install --offline --ignore-scripts",
      },
      data,
    ),
  );
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(
    await readFile(join(workspace, "generated/file.txt"), "utf8"),
    "hello",
  );
  const denied = JSON.parse(
    await runSandbox(
      allowed,
      { operation: "command", command: `cat '${join(data, "secret.txt")}'` },
      data,
    ),
  );
  assert.notEqual(denied.exitCode, 0);
  assert.doesNotMatch(denied.stdout, /private/);
  const readonly = JSON.parse(
    await runSandbox(
      { ...policy, commands: true },
      { operation: "command", command: "printf denied > denied.txt" },
      data,
    ),
  );
  assert.notEqual(readonly.exitCode, 0);
  assert.doesNotMatch(
    await runSandbox(allowed, { operation: "command", command: "env" }, data),
    /OPENAI_API_KEY|CONSOLE_ACCESS_TOKEN/,
  );
});

test("shell children inherit network blocking and cancellation stops delayed writes", async (t) => {
  const { policy, data, workspace } = await fixture(t);
  const server = createHttpServer((_req, response) => response.end("allowed"));
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
  t.after(() => new Promise<void>((accept) => server.close(() => accept())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const command = `node -e 'fetch("http://127.0.0.1:${address.port}").then(r=>r.text()).then(console.log).catch(()=>process.exit(2))'`;
  const allowed = { ...policy, commands: true, writePaths: [workspace] };
  const blocked = JSON.parse(
    await runSandbox(allowed, { operation: "command", command }, data),
  );
  assert.equal(blocked.exitCode, 2);
  const connected = JSON.parse(
    await runSandbox(
      { ...allowed, network: "unrestricted" },
      { operation: "command", command },
      data,
    ),
  );
  assert.equal(connected.exitCode, 0, JSON.stringify(connected));
  assert.match(connected.stdout, /allowed/);
  const controller = new AbortController();
  const pending = runSandbox(
    allowed,
    { operation: "command", command: "sleep 1; printf late > late.txt" },
    data,
    controller.signal,
  );
  const timer = setTimeout(() => controller.abort(), 200);
  await assert.rejects(pending, /cancelled/);
  clearTimeout(timer);
  await new Promise((accept) => setTimeout(accept, 1200));
  await assert.rejects(readFile(join(workspace, "late.txt")), {
    code: "ENOENT",
  });
});

test("official Pi read/write/edit/bash execute inside nono and cannot read private paths", async (t) => {
  const { workspace, data, extra, policy } = await fixture(t);
  const access = await validateSandbox(
    { ...policy, commands: true, writePaths: [workspace] },
    data,
  );
  const invoke = async (tool: string, args: Record<string, unknown>) =>
    JSON.parse(await runSandbox(access, { operation: "pi", tool, args }, data));
  const read = await invoke("read", { path: "input.txt" });
  assert.match(JSON.stringify(read.output), /inside/);
  await invoke("write", { path: "nested/native.txt", content: "before\n" });
  await invoke("edit", {
    path: "nested/native.txt",
    edits: [{ oldText: "before", newText: "after" }],
  });
  assert.equal(
    await readFile(join(workspace, "nested/native.txt"), "utf8"),
    "after\n",
  );
  const pwd = await invoke("bash", { command: "pwd" });
  assert.equal(pwd.structuredOutput.exitCode, 0);
  assert.equal(pwd.structuredOutput.output.trim(), workspace);
  for (const path of [join(data, "secret.txt"), join(extra, "extra.txt")]) {
    await assert.rejects(invoke("read", { path }));
    const denied = await invoke("bash", { command: `cat '${path}'` });
    assert.equal(denied.isError, true);
    assert.notEqual(denied.structuredOutput.exitCode, 0);
  }
  await symlink(join(data, "secret.txt"), join(workspace, "private-link"));
  await assert.rejects(invoke("read", { path: "private-link" }));
  const deniedWrite = await invoke("bash", {
    command: `echo changed > '${join(extra, "extra.txt")}'`,
  });
  assert.equal(deniedWrite.isError, true);
  assert.equal(await readFile(join(extra, "extra.txt"), "utf8"), "extra");
  const clean = await invoke("bash", { command: "env" });
  assert.doesNotMatch(
    clean.structuredOutput.output,
    /OPENAI_API_KEY=|ANTHROPIC_API_KEY=|CODEX_HOME=/,
  );
  await assert.rejects(
    runSandbox(
      { ...access, commands: false },
      { operation: "pi", tool: "bash", args: { command: "pwd" } },
      data,
    ),
    /disabled/,
  );
});

test("project conversations offer official Pi tools and include their absolute directory in model context", async (t) => {
  const { data, workspace } = await fixture(t);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const app = createApp({}, { dataDirectory: data, models: () => models });
  t.after(() => app.close());
  const headers = { "x-console-request": "1" };
  const project = (
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers,
      payload: { name: "Coding", path: workspace, requestId: "coding-project" },
    })
  ).json();
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: {
      workspaceId: project.id,
      access: "project",
      requestId: "coding-chat",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const snapshot = created.json();
  for (const name of ["read", "write", "edit", "bash"])
    assert.ok(snapshot.enabledTools.includes(name));
  assert.equal(snapshot.sandbox.network, "blocked");
  assert.deepEqual(snapshot.sandbox.writePaths, [workspace]);
  const base = `/v1/sessions/${snapshot.id}`;
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  faux.setResponses([
    (context) => {
      assert.ok(JSON.stringify(context.messages).includes(workspace));
      return fauxAssistantMessage(fauxToolCall("bash", { command: "pwd" }), {
        stopReason: "toolUse",
      });
    },
    (context) => {
      assert.match(
        JSON.stringify(context.messages.at(-1)),
        new RegExp(workspace),
      );
      return fauxAssistantMessage("Project directory verified");
    },
  ]);
  const sent = await app.inject({
    method: "POST",
    url: `${base}/messages`,
    headers,
    payload: {
      text: "What is the project directory?",
      requestId: "path-check",
    },
  });
  assert.equal(sent.statusCode, 202, sent.body);
  const done = await until(
    async () => (await app.inject(base)).json(),
    (value) =>
      value.status === "idle" &&
      value.messages.at(-1)?.text === "Project directory verified",
  );
  assert.ok(
    done.messages.some(
      (message: { toolName?: string }) => message.toolName === "bash",
    ),
  );
});

test("native Pi bash blocks TCP and cancellation stops descendant writes", async (t) => {
  const { workspace, data, policy } = await fixture(t);
  const access = { ...policy, commands: true, writePaths: [workspace] };
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
  t.after(() => new Promise<void>((accept) => server.close(() => accept())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const blocked = JSON.parse(
    await runSandbox(
      access,
      {
        operation: "pi",
        tool: "bash",
        args: {
          command: `node -e 'require("node:net").connect({port:${address.port},host:"127.0.0.1"}).on("error",()=>process.exit(7)).on("connect",()=>process.exit(0))'`,
        },
      },
      data,
    ),
  );
  assert.equal(blocked.structuredOutput.exitCode, 7);
  const controller = new AbortController();
  const running = runSandbox(
    access,
    {
      operation: "pi",
      tool: "bash",
      args: {
        command:
          "echo started > started.txt; (sleep 0.7; echo escaped > escaped.txt) & wait",
      },
    },
    data,
    controller.signal,
  );
  void running.catch(() => {});
  await until(
    async () =>
      readFile(join(workspace, "started.txt")).then(
        () => true,
        () => false,
      ),
    (ready) => ready,
  );
  controller.abort();
  await assert.rejects(running, /cancelled/);
  await new Promise((accept) => setTimeout(accept, 1000));
  await assert.rejects(readFile(join(workspace, "escaped.txt")), /ENOENT/);
});

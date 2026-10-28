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
} from "../src/sandbox-policy.ts";
import { runSandbox, sandboxSupport } from "../src/sandbox-runner.ts";

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
      payload: { name: "Sandbox", requestId: "sandbox" },
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

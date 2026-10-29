import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const headers = { "x-console-request": "1" };
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "console-host-"));
  const workspace = join(root, "project");
  await mkdir(workspace);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let app = createApp(
    {},
    { dataDirectory: join(root, "data"), models: () => models },
  );
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  const project = (
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers,
      payload: { name: "Host fixture", path: workspace, requestId: "project" },
    })
  ).json();
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: { workspaceId: project.id, requestId: "session" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const base = `/v1/sessions/${created.json().id}`;
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/config`,
        headers,
        payload: { provider: faux.provider.id, model: faux.getModel().id },
      })
    ).statusCode,
    200,
  );
  return {
    root,
    workspace,
    faux,
    base,
    get app() {
      return app;
    },
    async reopen() {
      await app.close();
      app = createApp(
        {},
        { dataDirectory: join(root, "data"), models: () => models },
      );
    },
  };
}
async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let n = 0; n < 300; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected host execution state did not arrive");
}

test("native Pi tools execute on the host, start in the project and survive reopening", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.workspace, "input.txt"), "input marker");
  await writeFile(join(f.root, "outside.txt"), "outside project marker");
  f.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read", { path: "input.txt" }), {
      stopReason: "toolUse",
    }),
    (context) => {
      assert.match(JSON.stringify(context.messages.at(-1)), /input marker/);
      return fauxAssistantMessage(
        fauxToolCall("write", { path: "nested/output.txt", content: "before" }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage(
      fauxToolCall("edit", {
        path: "nested/output.txt",
        edits: [{ oldText: "before", newText: "after" }],
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("bash", { command: "pwd; cat ../outside.txt" }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && !result.isError);
      assert.match(JSON.stringify(result), /outside project marker/);
      assert.ok(JSON.stringify(result).includes(f.workspace));
      return fauxAssistantMessage("Host tools completed");
    },
  ]);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${f.base}/messages`,
        headers,
        payload: { text: "Exercise host tools", requestId: "tools" },
      })
    ).statusCode,
    202,
  );
  const done = await until(
    async () => (await f.app.inject(f.base)).json(),
    (value) =>
      value.status === "idle" &&
      value.messages.at(-1)?.text === "Host tools completed",
  );
  assert.equal(done.workspace, f.workspace);
  assert.equal("sandbox" in done, false);
  assert.deepEqual(
    done.messages
      .filter((message: { role: string }) => message.role === "toolResult")
      .map((message: { toolName: string; isError: boolean }) => [
        message.toolName,
        Boolean(message.isError),
      ]),
    [
      ["read", false],
      ["write", false],
      ["edit", false],
      ["bash", false],
    ],
  );
  assert.equal(
    await readFile(join(f.workspace, "nested/output.txt"), "utf8"),
    "after",
  );
  await f.reopen();
  const restored = (await f.app.inject(f.base)).json();
  assert.equal(restored.workspace, f.workspace);
  assert.equal(restored.messages.at(-1).text, "Host tools completed");
  assert.ok(restored.enabledTools.includes("bash"));
});

test("cancel reaches Pi's native host shell and prevents a delayed write", async (t) => {
  const f = await fixture(t);
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("bash", {
        command: `node -e 'setTimeout(()=>require("fs").writeFileSync("late.txt","late"),1500)'`,
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  await f.app.inject({
    method: "POST",
    url: `${f.base}/messages`,
    headers,
    payload: { text: "Start a cancellable fixture", requestId: "cancel" },
  });
  await until(
    async () => (await f.app.inject(f.base)).json(),
    (value) =>
      value.liveTools?.some(
        (tool: { name: string; status: string }) =>
          tool.name === "bash" && tool.status === "running",
      ),
  );
  assert.equal(
    (await f.app.inject({ method: "POST", url: `${f.base}/cancel`, headers }))
      .statusCode,
    204,
  );
  await new Promise((resolve) => setTimeout(resolve, 1700));
  await assert.rejects(readFile(join(f.workspace, "late.txt")), {
    code: "ENOENT",
  });
});

test("sandbox APIs and access presets are removed from the host backend", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.app.inject("/v1/sandbox/support")).statusCode, 404);
  assert.equal(
    (
      await f.app.inject({
        method: "PATCH",
        url: `${f.base}/sandbox`,
        headers,
        payload: { enabled: true },
      })
    ).statusCode,
    404,
  );
  const info = (await f.app.inject("/v1/connection-info")).json();
  assert.ok(!info.capabilities.includes("sandbox"));
  const machine = (await f.app.inject("/v1/machines")).json()[0];
  assert.equal(machine.capabilities.execution, "host");
  assert.equal("sandboxedFiles" in machine.capabilities, false);
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { ConversationId } from "@earendil-works/pi-durable";
import { conversationView, messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

test("host MCP tools reconnect, stay opt-in, and support discovery and structured scripts", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-mcp-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = join(directory, "project");
  const ready = join(directory, "ready");
  await mkdir(workspace);
  const script = `
    import { existsSync } from "node:fs";
    import { createInterface } from "node:readline";
    if (!existsSync(${JSON.stringify(ready)})) process.exit(9);
    const schema = { type:"object", properties:{value:{type:"string"}}, required:["value"] };
    for await (const line of createInterface({ input: process.stdin })) {
      const { id, method, params } = JSON.parse(line);
      if (id === undefined) continue;
      const value = params?.arguments?.value + ":" + (process.env.CONSOLE_MCP_TEST_ALLOWED ?? "missing") + ":" + (process.env.CONSOLE_MCP_TEST_HIDDEN ?? "hidden");
      const result = method === "initialize" ? {
        protocolVersion:params.protocolVersion, capabilities:{tools:{}}, serverInfo:{name:"fixture",version:"1"}
      } : method === "tools/list" ? {
        tools:[{name:"echo",description:"Echo a value",inputSchema:schema,outputSchema:schema},
          {name:"unapproved",inputSchema:schema}]
      } : {content:[{type:"text",text:value}],structuredContent:{value}};
      console.log(JSON.stringify({jsonrpc:"2.0",id,result}));
    }
  `;
  process.env.CONSOLE_MCP_TEST_ALLOWED = "allowed";
  process.env.CONSOLE_MCP_TEST_HIDDEN = "host-only";
  t.after(() => {
    delete process.env.CONSOLE_MCP_TEST_ALLOWED;
    delete process.env.CONSOLE_MCP_TEST_HIDDEN;
  });
  await writeFile(
    join(directory, "mcp.json"),
    JSON.stringify({
      servers: {
        fixture: {
          command: process.execPath,
          args: ["--input-type=module", "-e", script],
          env: ["CONSOLE_MCP_TEST_ALLOWED"],
          tools: ["echo"],
        },
      },
    }),
    { mode: 0o600 },
  );
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("MCP", workspace);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const id = String(root.id);
  const base = `/v1/sessions/${sessionId}/conversations`;
  const path = `${base}/${id}`;
  const config = async () =>
    (await f.app.inject(`${path}/configuration`)).json();
  const change = async (update: {
    mcp?: boolean;
    codeMode?: boolean;
    sandbox?: boolean;
  }) =>
    f.app.inject({
      method: "PATCH",
      url: `${path}/configuration`,
      payload: { revision: (await config()).revision, ...update },
    });
  assert.equal((await config()).mcp.servers[0].connected, false);
  assert.equal((await change({ mcp: true })).statusCode, 409);
  await writeFile(ready, "");
  const reconnected = await f.app.inject({
    method: "POST",
    url: `${path}/mcp/reconnect`,
    payload: {},
  });
  assert.equal(reconnected.statusCode, 200, reconnected.body);
  assert.deepEqual(reconnected.json().servers, [
    { name: "fixture", connected: true, tools: 1 },
  ]);
  const enabled = await change({ mcp: true });
  assert.equal(enabled.statusCode, 200, enabled.body);
  assert.equal((await change({ sandbox: true })).statusCode, 409);
  assert.ok(
    (await root.agent(context)).deferred.some(
      (tool) => tool.name === "mcp__fixture__echo",
    ),
  );
  assert.ok(
    !(
      await (
        await harness.conversation(sibling.id as ConversationId, context)
      )?.agent(context)
    )?.tools.some((tool) => tool.name.startsWith("mcp__")),
  );
  const tool = (name: string, args: Record<string, string>) =>
    fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
  f.faux.setResponses([
    tool("tool_search", { query: "mcp__fixture__echo" }),
    tool("mcp__fixture__echo", { value: "direct" }),
    fauxAssistantMessage("MCP finished."),
  ]);
  const model = { provider: "test", modelId: "test-model" };
  await f.service.submit(
    sessionId,
    id,
    "Use the configured tool",
    randomUUID(),
    { model },
  );
  await harness.waitForIdle(context);
  assert.match(
    (await f.app.inject(`${path}/history`)).body,
    /direct:allowed:hidden/,
  );
  await f.app.close();
  f = await fixture(directory);
  const reopened = (await f.service.session(sessionId)).harness;
  assert.ok(
    (await (await reopened.root(context)).agent(context)).tools.some(
      (tool) => tool.name === "mcp__fixture__echo",
    ),
  );
  assert.equal((await change({ codeMode: true })).statusCode, 200);
  f.faux.setResponses([
    tool("codemode", {
      code: 'const result = await tools.mcp__fixture__echo({value:"script"}); text(result.value);',
    }),
    fauxAssistantMessage("MCP script finished."),
  ]);
  await f.service.submit(
    sessionId,
    id,
    "Use the tool in a script",
    randomUUID(),
    { model },
  );
  await reopened.waitForIdle(context);
  const history = (await f.app.inject(`${path}/history`)).body;
  assert.match(history, /script:allowed:hidden/);
  assert.doesNotMatch(history, /host-only/);
  const disabled = await change({ mcp: false });
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.ok(
    disabled
      .json()
      .tools.some((entry: { name: string }) => entry.name === "tool_search"),
  );
  assert.ok(
    !disabled
      .json()
      .tools.some((entry: { name: string }) => entry.name.startsWith("mcp__")),
  );
});

test("Code Mode honors tool selection, persists discovery, and records nested edits for checks", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-codemode-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = join(directory, "project");
  await mkdir(workspace);
  await writeFile(join(workspace, "evidence.txt"), "local evidence");
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Code Mode", workspace);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const id = String(root.id);
  const path = `/v1/sessions/${sessionId}/conversations/${id}`;
  const change = async (update: {
    codeMode?: boolean;
    tools?: string[];
    postRunCommand?: string;
  }) => {
    const { revision } = (await f.app.inject(`${path}/configuration`)).json();
    const response = await f.app.inject({
      method: "PATCH",
      url: `${path}/configuration`,
      payload: { revision, ...update },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const chosen = await change({ tools: ["read", "review_workspace"] });
  assert.equal(chosen.codeMode, false);
  const enabled = await change({ codeMode: true });
  assert.equal(enabled.codeMode, true);
  assert.equal(
    enabled.tools.find(
      (tool: { name: string }) => tool.name === "review_workspace",
    ).deferred,
    true,
  );
  const call = (name: string, args: Record<string, string>) =>
    fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
  f.faux.setResponses([
    call("tool_search", { query: "review_workspace" }),
    call("codemode", {
      code: 'text(await tools.read({path:"evidence.txt"})); try { await tools.write({path:"forbidden.txt",content:"bad"}); } catch { text("write unavailable"); }',
    }),
    fauxAssistantMessage("Script finished."),
  ]);
  const model = { provider: "test", modelId: "test-model" };
  await f.service.submit(sessionId, id, "Discover and read", randomUUID(), {
    model,
  });
  await harness.waitForIdle(context);
  assert.ok(
    (await root.agent(context)).tools.some(
      (tool) => tool.name === "review_workspace",
    ),
  );
  await assert.rejects(readFile(join(workspace, "forbidden.txt")), {
    code: "ENOENT",
  });
  const results = (await f.app.inject(`${path}/history`))
    .json()
    .messages.filter((message: { role: string }) => message.role === "tool");
  assert.match(JSON.stringify(results), /Loaded 1 tool/);
  assert.match(JSON.stringify(results), /local evidence/);
  assert.match(JSON.stringify(results), /write unavailable/);
  await f.app.close();
  f = await fixture(directory);
  const reopened = (await f.service.session(sessionId)).harness;
  const restored = await reopened.root(context);
  assert.ok(
    (await restored.agent(context)).tools.some(
      (tool) => tool.name === "review_workspace",
    ),
  );
  await change({
    tools: ["read", "write", "review_workspace", "codemode", "tool_search"],
  });
  await change({
    postRunCommand: "test -f script-edit.txt && printf nested-check-ok",
  });
  f.faux.setResponses([
    call("codemode", {
      code: 'await tools.write({path:"script-edit.txt",content:"script evidence"});',
    }),
    fauxAssistantMessage("Script edit finished."),
  ]);
  await f.service.submit(sessionId, id, "Script an edit", randomUUID(), {
    model,
  });
  await reopened.waitForIdle(context);
  assert.equal(
    await readFile(join(workspace, "script-edit.txt"), "utf8"),
    "script evidence",
  );
  const history = (await f.app.inject(`${path}/history`)).body;
  assert.match(history, /nested-check-ok/);
  assert.match(history, /Nested tools/);
  const disabled = await change({ codeMode: false });
  assert.deepEqual(
    disabled.tools
      .filter((tool: { enabled: boolean }) => tool.enabled)
      .map((tool: { name: string }) => tool.name),
    ["read", "write", "review_workspace"],
  );
});

test("foreground reviewer is visible through its parent scope and erased with the parent", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Review", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const base = `/v1/sessions/${sessionId}/conversations`;
  const parent = `${base}/${root.id}`;
  const watch = await root.watch(context);
  t.after(() => watch.stop());
  const { promise: childId, resolve: reveal } = Promise.withResolvers<number>();
  watch.start(async (call) => {
    if (call.kind !== "value") return;
    const id = conversationView(call.value).execution.tools.find(
      (tool) => tool.reviewId,
    )?.reviewId;
    if (id !== undefined) reveal(id);
  });
  const { promise: release, resolve: finish } = Promise.withResolvers<void>();
  t.after(() => finish());
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("review_workspace", { brief: "Find a bug." }),
      { stopReason: "toolUse" },
    ),
    async (request, options) => {
      assert.deepEqual(
        request.messages.flatMap((message) =>
          message.role === "system"
            ? (message.toolsAdded ?? []).map((tool) => tool.name)
            : [],
        ),
        ["read"],
      );
      await Promise.race([
        release,
        new Promise<void>((resolve) =>
          options?.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        ),
      ]);
      return fauxAssistantMessage(
        fauxToolCall("write", {
          path: "should-not-exist",
          content: "forbidden",
        }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage("Found a bug in the input parser."),
    fauxAssistantMessage("The reviewer found a parser issue."),
  ]);
  await f.service.submit(
    sessionId,
    String(root.id),
    "Review the parser",
    randomUUID(),
    {
      model: { provider: "test", modelId: "test-model" },
    },
  );
  const reviewId = await childId;
  const reviewUrl = `${parent}/reviews/${reviewId}`;
  const active = await f.app.inject(reviewUrl);
  assert.equal(active.statusCode, 200, active.body);
  assert.equal(active.json().busy, true);
  assert.equal(
    (await f.app.inject(`${base}/${sibling.id}/reviews/${reviewId}`))
      .statusCode,
    404,
  );
  assert.equal(
    (await f.app.inject(`${base}/${reviewId}/configuration`)).statusCode,
    404,
  );
  assert.equal((await f.app.inject(base)).json().conversations.length, 2);
  finish();
  await harness.waitForIdle(context);
  await assert.rejects(readFile(join(directory, "should-not-exist")), {
    code: "ENOENT",
  });
  const history = (await f.app.inject(`${parent}/history`)).json();
  assert.equal(
    history.messages.find(
      (message: { toolName?: string }) =>
        message.toolName === "review_workspace",
    ).reviewId,
    reviewId,
  );
  await watch.stop();
  await f.app.close();
  f = await fixture(directory);
  const saved = await f.app.inject(reviewUrl);
  assert.equal(saved.statusCode, 200, saved.body);
  assert.match(saved.body, /Found a bug in the input parser/);
  assert.equal(saved.json().busy, false);
  await f.service.archiveConversation(sessionId, String(root.id), false);
  assert.equal((await f.app.inject(reviewUrl)).statusCode, 404);
  await f.service.deleteArchivedConversation(sessionId, String(root.id));
  const remaining = (await f.app.inject(base)).json().conversations;
  assert.deepEqual(
    remaining.map((row: { id: number }) => row.id),
    [sibling.id],
  );
  const reopened = (await f.service.session(sessionId)).harness;
  assert.equal(
    (
      await (
        await reopened.conversation(reviewId as ConversationId, context)
      )?.entries({}, 1, undefined, context)
    )?.items.length,
    0,
  );
});

test("stopping the parent cancels an in-flight review", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-cancel-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const { promise: started, resolve: begin } = Promise.withResolvers<void>();
  const { promise: cancelled, resolve: abort } = Promise.withResolvers<void>();
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("review_workspace", { brief: "Review the workspace." }),
      { stopReason: "toolUse" },
    ),
    async (_request, options) => {
      begin();
      await new Promise<void>((resolve) => {
        if (options?.signal?.aborted) resolve();
        else
          options?.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
      });
      abort();
      return fauxAssistantMessage("Cancelled", { stopReason: "aborted" });
    },
  ]);
  await f.service.submit(sessionId, String(root.id), "Review", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await started;
  await f.service.stopConversation(sessionId, String(root.id));
  await cancelled;
  assert.equal((await harness.inspect(context)).tasks.length, 0);
});

test("saved inspection tool selections resolve to their remaining coding tools", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-legacy-tools-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "project");
  await mkdir(path);
  await writeFile(join(path, "README.md"), "Project evidence\n");
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Task tracker", path);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  // Simulate an allowlist saved before the inspection tools were retired.
  f.projects.store.setAgentSettings(project.id, {
    tools: ["read_file", "read", "search_text", "list_directory"],
    instructions: "",
  });
  const conversation = await f.service.addConversation(sessionId);
  const id = String(conversation.id);
  await f.app.close();
  f = await fixture(directory);

  const configuration = await f.service.configuration(sessionId, id);
  assert.deepEqual(
    configuration.tools.map(({ name, enabled }) => [name, enabled]),
    [
      ["read", true],
      ["write", false],
      ["edit", false],
      ["bash", false],
      ["review_workspace", false],
      ["reviewer_profiles", false],
      ["background_agent", false],
      ["stop_background_agent", false],
    ],
  );
  const standalone = await f.service.createStandalone();
  const { conversationId } = await f.service.standalone(standalone.sessionId);
  assert.deepEqual(
    (
      await f.service.configuration(
        standalone.sessionId,
        String(conversationId),
      )
    ).tools
      .filter(({ enabled }) => enabled)
      .map(({ name }) => name),
    [
      "read",
      "write",
      "edit",
      "bash",
      "review_workspace",
      "reviewer_profiles",
      "background_agent",
      "stop_background_agent",
    ],
  );

  f.faux.setResponses([
    (request) => {
      assert.deepEqual(
        request.messages
          .flatMap((message) =>
            message.role === "system" ? (message.toolsAdded ?? []) : [],
          )
          .map(({ name }) => name),
        ["read"],
      );
      assert.ok(JSON.stringify(request.messages).includes("Task tracker"));
      return fauxAssistantMessage(fauxToolCall("read", { path: "README.md" }), {
        stopReason: "toolUse",
      });
    },
    (request) => {
      const result = request.messages.find(
        (message) => message.role === "toolResult",
      );
      assert.equal(result?.isError, false);
      assert.ok(JSON.stringify(result).includes("Project evidence"));
      return fauxAssistantMessage("Read the project file.");
    },
  ]);
  await f.service.submit(sessionId, id, "Explain this project", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await (await f.service.session(sessionId)).harness.waitForIdle(context);
  assert.ok(
    messages((await f.service.history(sessionId, id)).items).some(
      ({ text }) => text === "Read the project file.",
    ),
  );
});

test("crash after a committed tool result recovers without repeating that tool", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-tools-crash-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "project");
  await mkdir(path);
  await writeFile(join(path, "README.md"), "Original evidence\n");
  const { spawn } = await import("node:child_process");
  const { EventEmitter } = await import("node:events");
  const once = EventEmitter.once;
  const fixtureUrl = new URL("./support/harness-fixture.ts", import.meta.url)
    .href;
  const aiUrl = import.meta.resolve("@earendil-works/pi-ai");
  const source = `import {fixture} from ${JSON.stringify(fixtureUrl)};
    import {fauxAssistantMessage,fauxToolCall} from ${JSON.stringify(aiUrl)};
    let descriptor;
    const f = await fixture(${JSON.stringify(directory)}, faux => faux.setResponses([
      fauxAssistantMessage(fauxToolCall('read',{path:'README.md'}),{stopReason:'toolUse'}),
      async () => { process.send(descriptor); await new Promise(() => {}); }
    ]));
    const project = await f.projects.register('Recovery',${JSON.stringify(path)});
    const session = (await f.service.list(project.id)).sessions[0];
    const list = await f.service.conversations(session.sessionId);
    descriptor = {sessionId:session.sessionId,id:list.conversations[0].id};
    await f.service.submit(session.sessionId,String(descriptor.id),'Inspect',${JSON.stringify(randomUUID())},{model:{provider:'test',modelId:'test-model'}});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  t.after(() => child.kill("SIGKILL"));
  let errors = "";
  child.stderr?.on("data", (data) => {
    errors += data;
  });
  const [descriptor] = await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error(`Recovery child exited: ${errors}`);
    }),
  ]);
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  // A replayed read would see different data; the committed result must remain original.
  await writeFile(join(path, "README.md"), "Changed after crash\n");
  const f = await fixture(directory, (faux) =>
    faux.setResponses([
      (request) => {
        const results = request.messages.filter(
          (message) => message.role === "toolResult",
        );
        assert.equal(results.length, 1);
        assert.ok(JSON.stringify(results).includes("Original evidence"));
        assert.ok(!JSON.stringify(results).includes("Changed after crash"));
        return fauxAssistantMessage("Recovered from stored evidence.");
      },
    ]),
  );
  t.after(() => f.app.close());
  await (await f.service.session(descriptor.sessionId)).harness.waitForIdle(
    context,
  );
  const history = (
    await f.service.history(descriptor.sessionId, String(descriptor.id))
  ).items;
  assert.equal(history.filter((entry) => entry.kind === "pi.user").length, 1);
  assert.equal(
    messages(history).filter((message) => message.role === "tool").length,
    1,
  );
  assert.ok(
    JSON.stringify(history).includes("Recovered from stored evidence."),
  );
});

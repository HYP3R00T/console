import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { conversationView, messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

test("project tools supply real evidence, publish safe activity and survive reopen; standalone has no project tools", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-project-tools-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "project");
  await mkdir(path);
  await writeFile(
    join(path, "README.md"),
    "A task tracker built with Fastify.\n",
  );
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Task tracker", path);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  const calls = [
    fauxToolCall("list_directory", {}),
    fauxToolCall("read_file", { path: "README.md" }),
    fauxToolCall("search_text", { query: "Fastify" }),
    fauxToolCall("read_file", { path: "../providers.sqlite" }),
    fauxToolCall("read_file", { path: "missing.txt" }),
  ];
  f.faux.setResponses([
    (request) => {
      assert.deepEqual(
        request.messages
          .flatMap((message) =>
            message.role === "system" ? (message.toolsAdded ?? []) : [],
          )
          .map((tool) => tool.name),
        [
          "read",
          "write",
          "edit",
          "bash",
          "list_directory",
          "read_file",
          "search_text",
        ],
      );
      assert.ok(JSON.stringify(request.messages).includes("Task tracker"));
      assert.ok(JSON.stringify(request.messages).includes(path));
      return fauxAssistantMessage(calls, { stopReason: "toolUse" });
    },
    (request) => {
      const results = request.messages.filter(
        (message) => message.role === "toolResult",
      );
      assert.equal(results.length, 5);
      assert.ok(
        JSON.stringify(results).includes(
          "1: A task tracker built with Fastify.",
        ),
      );
      assert.ok(JSON.stringify(results).includes("outside_project"));
      assert.ok(JSON.stringify(results).includes("not_found"));
      return fauxAssistantMessage(
        "This project is a task tracker using Fastify (README.md:1).",
      );
    },
  ]);
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "Explain this project",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await harness.waitForIdle(context);
  const history = await f.service.history(session.sessionId, String(root.id));
  const projected = messages(history.items);
  assert.ok(
    projected.some(
      (message) =>
        message.text ===
          "This project is a task tracker using Fastify (README.md:1)." &&
        !message.failed,
    ),
  );
  assert.equal(projected.filter((m) => m.role === "tool").length, 5);
  assert.equal(
    projected.filter((m) => m.role === "tool" && m.failed).length,
    2,
  );
  assert.equal(projected.find((m) => m.toolCalls)?.toolCalls?.length, 5);
  assert.ok(!JSON.stringify(projected).includes("secret-not-in-responses"));
  const watch = await root.watch(context);
  assert.equal(conversationView(watch.value).activeTools.length, 0);
  await watch.stop();
  await f.app.close();
  f = await fixture(directory);
  const restored = messages(
    (await f.service.history(session.sessionId, String(root.id))).items,
  );
  assert.deepEqual(restored, projected);
  assert.equal(f.faux.state.callCount, 0);
  const standalone = await f.service.createStandalone();
  const standaloneDetails = await f.service.standalone(standalone.sessionId);
  f.faux.setResponses([
    (request) => {
      assert.equal(
        request.messages.flatMap((message) =>
          message.role === "system" ? (message.toolsAdded ?? []) : [],
        ).length,
        4,
      );
      assert.ok(!JSON.stringify(request.messages).includes(path));
      return fauxAssistantMessage("Ordinary chat.");
    },
  ]);
  await f.service.submit(
    standalone.sessionId,
    String(standaloneDetails.conversationId),
    "Hello",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await (await f.service.session(standalone.sessionId)).harness.waitForIdle(
    context,
  );
  assert.ok(
    messages(
      (
        await f.service.history(
          standalone.sessionId,
          String(standaloneDetails.conversationId),
        )
      ).items,
    ).some((message) => message.text === "Ordinary chat." && !message.failed),
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
      fauxAssistantMessage(fauxToolCall('read_file',{path:'README.md'}),{stopReason:'toolUse'}),
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

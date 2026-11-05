import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { fixture } from "./support/harness-fixture.ts";

test("native coding tools execute in the project; configuration is isolated, validated and survives restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-configuration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "project"));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register(
    "Coding",
    join(directory, "project"),
  );
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const id = String(root.id);
  const url = `/v1/sessions/${sessionId}/conversations/${id}/configuration`;
  const initial = await f.service.configuration(sessionId, id);
  assert.equal(initial.tools.length, 7);
  assert.equal(initial.toolSource, "default");
  assert.ok(
    initial.sections.some((section) => section.text.includes("not a sandbox")),
  );
  const modified = await f.service.configureConversation(sessionId, id, {
    revision: initial.revision,
    instructions: "Always cite evidence.",
  });
  assert.equal(
    (await f.service.configuration(sessionId, String(sibling.id))).instructions,
    "",
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PATCH",
        url,
        payload: { revision: initial.revision, tools: [] },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PATCH",
        url,
        payload: { revision: modified.revision, tools: ["missing"] },
      })
    ).statusCode,
    400,
  );
  f.faux.setResponses([
    (request) => {
      assert.ok(
        JSON.stringify(request.messages).includes("Always cite evidence."),
      );
      return fauxAssistantMessage(
        fauxToolCall("write", { path: "proof.txt", content: "before\n" }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage(
      fauxToolCall("edit", {
        path: "proof.txt",
        edits: [{ oldText: "before", newText: "after" }],
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("bash", { command: "pwd; cat proof.txt", timeout: 5 }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxToolCall("read", { path: "proof.txt" }), {
      stopReason: "toolUse",
    }),
    (request) => {
      const results = request.messages.filter(
        (message) => message.role === "toolResult",
      );
      assert.equal(results.length, 4);
      assert.ok(results.every((result) => !result.isError));
      assert.ok(JSON.stringify(results).includes(join(directory, "project")));
      return fauxAssistantMessage("Verified.");
    },
  ]);
  await f.service.submit(sessionId, id, "Run", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await harness.waitForIdle(context);
  assert.equal(
    await readFile(join(directory, "project", "proof.txt"), "utf8"),
    "after\n",
  );
  const current = await f.service.configuration(sessionId, id);
  const changed = await f.service.configureConversation(sessionId, id, {
    revision: current.revision,
    tools: [],
  });
  assert.ok(changed.tools.every((tool) => !tool.enabled));
  f.faux.setResponses([
    () => {
      return fauxAssistantMessage(
        fauxToolCall("bash", { command: "touch forbidden" }),
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage("Tool unavailable."),
  ]);
  await f.service.submit(sessionId, id, "Try disabled", randomUUID());
  await harness.waitForIdle(context);
  await assert.rejects(readFile(join(directory, "project", "forbidden")), {
    code: "ENOENT",
  });
  await f.app.close();
  f = await fixture(directory);
  const restored = await f.service.configuration(sessionId, id);
  assert.equal(restored.instructions, "Always cite evidence.");
  assert.ok(restored.tools.every((tool) => !tool.enabled));
  const reset = await f.service.configureConversation(sessionId, id, {
    revision: restored.revision,
    tools: null,
    instructions: null,
  });
  assert.ok(reset.tools.every((tool) => tool.enabled));
  assert.equal(reset.toolSource, "default");
  assert.equal(reset.instructions, "");
});

test("configuration changes reject active work and archived conversations", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-configuration-busy-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const id = String((await f.service.standalone(sessionId)).conversationId);
  const initial = await f.service.configuration(sessionId, id);
  let entered!: () => void;
  const running = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.faux.setResponses([
    async (_request, options) => {
      entered();
      await new Promise<void>((resolve) => {
        if (options?.signal?.aborted) resolve();
        else
          options?.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
      });
      return fauxAssistantMessage("Stopped", { stopReason: "aborted" });
    },
  ]);
  await f.service.submit(sessionId, id, "Wait", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await running;
  await assert.rejects(
    f.service.configureConversation(sessionId, id, {
      revision: initial.revision,
      tools: [],
    }),
    /Stop or finish/,
  );
  await f.service.stopConversation(sessionId, id);
  await f.service.archiveConversation(sessionId, id, false);
  await assert.rejects(f.service.configuration(sessionId, id), /archived/);
});

test("stopping native bash interrupts execution in a standalone workspace", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-coding-stop-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const id = String((await f.service.standalone(sessionId)).conversationId);
  const workspace = join(directory, "sessions", "workspaces", sessionId);
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("bash", {
        command:
          "printf started > started; sleep 30; printf finished > finished",
        timeout: 35,
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Finished"),
  ]);
  await f.service.submit(sessionId, id, "Wait", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  const deadline = Date.now() + 4000;
  while (true) {
    try {
      await readFile(join(workspace, "started"));
      break;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" ||
        Date.now() > deadline
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  await f.service.stopConversation(sessionId, id);
  await assert.rejects(readFile(join(workspace, "finished")), {
    code: "ENOENT",
  });
});

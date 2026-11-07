import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { PersistentAgents } from "../src/harnesses/persistent-agents.ts";
import { fixture } from "./support/harness-fixture.ts";

test("model creates and lists persistent agents without giving children orchestration tools", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-agent-tools-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const parent = await harness.root(context);
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("background_agent", {
        action: "create",
        name: "Researcher",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxToolCall("background_agent", { action: "list" }), {
      stopReason: "toolUse",
    }),
    (request) => {
      assert.match(JSON.stringify(request.messages), /Researcher/);
      return fauxAssistantMessage("Agent ready");
    },
  ]);
  await f.service.submit(
    sessionId,
    String(parent.id),
    "Create an agent",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await parent.waitForIdle(context);
  const state = await harness.snapshot(PersistentAgents, parent.id, context);
  assert.equal(state?.agents.length, 1);
  assert.ok(state);
  const child = await harness.conversation(
    state.agents[0].conversationId,
    context,
  );
  assert.ok(child);
  assert.ok(
    !(await child.agent(context)).tools.some(
      (tool) =>
        tool.name === "background_agent" ||
        tool.name === "stop_background_agent",
    ),
  );
  assert.ok(
    (await parent.agent(context)).tools.some(
      (tool) => tool.name === "background_agent",
    ),
  );
});

test("model sends a background request and waits for its report without blocking delivery", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-agent-wait-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const parent = await harness.root(context);
  await parent.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const agent = await f.service.createAgent(
    sessionId,
    String(parent.id),
    randomUUID(),
    "Researcher",
  );
  const child = await harness.conversation(agent.conversationId, context);
  assert.ok(child);
  // Distinct input text identifies concurrent parent and child requests.
  await child.configure(
    { model: { provider: "test", modelId: "reasoning-model" } },
    context,
  );
  let parentStep = 0;
  f.faux.setResponses(
    Array.from({ length: 4 }, () => (request) => {
      if (
        request.messages.some(
          (message) =>
            message.role === "user" &&
            JSON.stringify(message.content).includes("Find evidence"),
        )
      )
        return fauxAssistantMessage("Cobalt evidence found");
      if (parentStep++ === 0)
        return fauxAssistantMessage(
          fauxToolCall("background_agent", {
            action: "send",
            agentId: agent.id,
            content: "Find evidence",
          }),
          { stopReason: "toolUse" },
        );
      const results = request.messages.filter(
        (message) => message.role === "toolResult",
      );
      if (parentStep === 2) {
        const last = results.at(-1);
        assert.ok(last?.role === "toolResult");
        const text = last.content.find((part) => part.type === "text");
        assert.ok(text?.type === "text");
        const { taskId } = JSON.parse(text.text);
        return fauxAssistantMessage(
          fauxToolCall("background_agent", { action: "wait", taskId }),
          { stopReason: "toolUse" },
        );
      }
      assert.match(JSON.stringify(request.messages), /Cobalt evidence found/);
      return fauxAssistantMessage("Evidence received");
    }),
  );
  await f.service.submit(
    sessionId,
    String(parent.id),
    "Research",
    randomUUID(),
  );
  await parent.waitForIdle(context);
  assert.equal(parentStep, 3);
});

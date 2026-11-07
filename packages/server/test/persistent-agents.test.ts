import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  AgentReportEntry,
  admitAgentMessage,
  createPersistentAgent,
  PersistentAgents,
} from "../src/harnesses/persistent-agents.ts";
import { fixture } from "./support/harness-fixture.ts";

for (const delivery of ["display", "context", "followUp"] as const) {
  test(`persistent agent retains context and ${delivery} delivery across reopening`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), "console-persistent-agent-"),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    let { harness } = await f.service.session(sessionId);
    let parent = await harness.root(context);
    await parent.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    const id = randomUUID();
    const agent = await parent.commit(
      (tx) => createPersistentAgent(tx, parent.id, id, "Researcher"),
      context,
    );
    assert.deepEqual(
      await parent.commit(
        (tx) => createPersistentAgent(tx, parent.id, id, "Ignored retry name"),
        context,
      ),
      agent,
    );
    const child = await harness.conversation(agent.conversationId, context);
    assert.ok(child);
    f.faux.setResponses([
      fauxAssistantMessage("Remember the cobalt marker."),
      fauxAssistantMessage("Acknowledged the report."),
    ]);
    const requestId = randomUUID();
    const reporter = await parent.commit(
      (tx) =>
        admitAgentMessage(
          tx,
          parent.id,
          agent,
          child,
          "Find the marker",
          requestId,
          "followUp",
          delivery,
        ),
      context,
    );
    harness.resume();
    await harness.waitForTask(reporter, context);
    await parent.waitForIdle(context);
    assert.equal(f.faux.state.callCount, delivery === "followUp" ? 2 : 1);
    const reports = (
      await parent.entries({}, 100, undefined, context)
    ).items.filter(AgentReportEntry.is);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].data.status, "completed");
    assert.equal(
      JSON.stringify((await parent.context(context)).messages).includes(
        "cobalt marker",
      ),
      delivery !== "display",
    );
    await f.app.close();
    f = await fixture(directory);
    ({ harness } = await f.service.session(sessionId));
    parent = await harness.root(context);
    const reopenedChild = await harness.conversation(
      agent.conversationId,
      context,
    );
    assert.ok(reopenedChild);
    assert.deepEqual(
      (await harness.snapshot(PersistentAgents, parent.id, context))?.agents,
      [agent],
    );
    const repeated = await parent.commit(
      (tx) =>
        admitAgentMessage(
          tx,
          parent.id,
          agent,
          reopenedChild,
          "Find the marker",
          requestId,
          "followUp",
          delivery,
        ),
      context,
    );
    assert.equal(repeated, reporter);
    assert.equal(f.faux.state.callCount, 0);
    f.faux.setResponses([
      (request) => {
        assert.match(
          JSON.stringify(request.messages),
          /Remember the cobalt marker/,
        );
        return fauxAssistantMessage("The marker remains cobalt.");
      },
    ]);
    const next = await parent.commit(
      (tx) =>
        admitAgentMessage(
          tx,
          parent.id,
          agent,
          reopenedChild,
          "What did you find earlier?",
          randomUUID(),
          "followUp",
          "context",
        ),
      context,
    );
    harness.resume();
    await harness.waitForTask(next, context);
    assert.equal(f.faux.state.callCount, 1);
    const entries = (await parent.entries({}, 100, undefined, context)).items;
    const forkAt = entries[0].id;
    const fork = await parent.fork(
      forkAt,
      { ownership: { kind: "ownerless" } },
      context,
    );
    assert.deepEqual(
      (await harness.snapshot(PersistentAgents, fork.id, context))?.agents ??
        [],
      [],
    );
  });
}

for (const stopScope of ["agent", "session"] as const) {
  test(`${stopScope} Stop cancels active and queued agent input while parent Stop leaves it running`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-agent-stop-"));
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
    const agent = await parent.commit(
      (tx) => createPersistentAgent(tx, parent.id, randomUUID(), "Worker"),
      context,
    );
    const child = await harness.conversation(agent.conversationId, context);
    assert.ok(child);
    harness.resume();
    await harness.waitForTask(agent.anchorId, context);
    const started = Promise.withResolvers<void>();
    let aborted = false;
    f.faux.setResponses([
      async (_request, options) => {
        started.resolve();
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) resolve();
          else
            options?.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            });
        });
        aborted = true;
        return fauxAssistantMessage("Stopped", { stopReason: "aborted" });
      },
    ]);
    const send = (requestId: string, content: string) =>
      parent.commit(
        (tx) =>
          admitAgentMessage(
            tx,
            parent.id,
            agent,
            child,
            content,
            requestId,
            "followUp",
            "display",
          ),
        context,
      );
    const activeId = randomUUID();
    const active = await send(activeId, "Work until stopped");
    harness.resume();
    await started.promise;
    // The terminal background anchor is absent from the live graph, but its
    // persistent ownership edge must still include the child's current work.
    const base = `/v1/sessions/${sessionId}/conversations/${parent.id}`;
    const activeView = await f.app.inject({ url: `${base}/tasks` });
    assert.equal(activeView.statusCode, 200, activeView.body);
    assert.ok(
      activeView
        .json()
        .tasks.some(
          (task: { conversationId: number }) =>
            task.conversationId === child.id,
        ),
    );
    const sibling = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      context,
    );
    const siblingView = await f.app.inject({
      url: `/v1/sessions/${sessionId}/conversations/${sibling.id}/tasks`,
    });
    assert.deepEqual(siblingView.json().tasks, []);
    const history = await f.app.inject({ url: `${base}/tasks/history` });
    const anchor = history
      .json()
      .tasks.find((task: { id: number }) => task.id === agent.anchorId);
    assert.ok(anchor);
    assert.equal(anchor.reviewId, undefined);
    const queuedId = randomUUID();
    const queued = await send(queuedId, "Queued work");
    await f.service.stopConversation(sessionId, String(parent.id));
    assert.equal(aborted, false);
    if (stopScope === "agent") await child.abort(context);
    else await f.service.stop(sessionId);
    await harness.waitForTask(active, context);
    await harness.waitForTask(queued, context);
    assert.equal(aborted, true);
    assert.equal(f.faux.state.callCount, 1);
    assert.equal(await send(queuedId, "Queued work"), queued);
    const reports = (
      await parent.entries({}, 100, undefined, context)
    ).items.filter(AgentReportEntry.is);
    if (stopScope === "agent") assert.equal(reports.length, 2);
    assert.ok(reports.every((entry) => entry.data.status === "cancelled"));
    f.faux.setResponses([fauxAssistantMessage("New work completed")]);
    const next = await send(randomUUID(), "Start new work");
    harness.resume();
    await harness.waitForTask(next, context);
    assert.equal(f.faux.state.callCount, 2);
  });
}

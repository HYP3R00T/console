import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import {
  BackgroundJob,
  BackgroundJobEntry,
  captureJobAgent,
} from "../src/harnesses/background-job.ts";
import { RecurringJob } from "../src/harnesses/recurring-job.ts";
import { messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

for (const delivery of ["display", "context", "followUp"] as const) {
  test(`background job ${delivery} uses captured coding tools after reopen and delivers once`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-job-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    let { harness } = await f.service.session(sessionId);
    const parent = await harness.root(context);
    await parent.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    const agent = captureJobAgent(await parent.agent(context));
    const id = await parent.commit(
      (tx) =>
        tx.createTask(
          BackgroundJob,
          {
            content: "Write result.txt",
            at: Date.now() + 500,
            agent,
            delivery,
            postRun: { command: "test -f result.txt", repairLimit: 0 },
          },
          { ownership: { kind: "conversation" }, background: true },
        ),
      context,
    );
    await parent.configure({ tools: [] }, context);
    await f.app.close();
    f = await fixture(directory, (faux) =>
      faux.setResponses([
        (request) => {
          assert.ok(
            request.messages.some(
              (message) =>
                message.role === "system" &&
                message.toolsAdded?.some((tool) => tool.name === "write"),
            ),
          );
          assert.ok(
            !request.messages.some(
              (message) =>
                message.role === "system" &&
                message.toolsAdded?.some(
                  (tool) => tool.name === "background_agent",
                ),
            ),
          );
          return fauxAssistantMessage(
            fauxToolCall("write", {
              path: "result.txt",
              content: "worker output",
            }),
            { stopReason: "toolUse" },
          );
        },
        fauxAssistantMessage("Job finished."),
        ...(delivery === "followUp"
          ? [fauxAssistantMessage("Parent received it.")]
          : []),
      ]),
    );
    ({ harness } = await f.service.session(sessionId));
    assert.equal(
      (await harness.waitForTask(id, context)).state.outcome?.status,
      "completed",
    );
    assert.equal(
      await readFile(
        join(directory, "sessions", "workspaces", sessionId, "result.txt"),
        "utf8",
      ),
      "worker output",
    );
    const base = `/v1/sessions/${sessionId}/conversations/${parent.id}`;
    const transcript = await f.app.inject(`${base}/jobs/${id}`);
    assert.equal(transcript.statusCode, 200, transcript.body);
    assert.ok(
      transcript
        .json()
        .messages.some(
          (message: { text: string }) => message.text === "Job finished.",
        ),
    );
    const sibling = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      context,
    );
    assert.equal(
      (
        await f.app.inject(
          `/v1/sessions/${sessionId}/conversations/${sibling.id}/jobs/${id}`,
        )
      ).statusCode,
      404,
    );
    const history = (await f.app.inject(`${base}/tasks/history`)).json();
    assert.equal(
      history.tasks.find((task: { id: number }) => task.id === id).jobTaskId,
      id,
    );
    const reopened = await harness.root(context);
    const entries = (await reopened.entries({}, 100, undefined, context)).items;
    assert.equal(entries.filter(BackgroundJobEntry.is).length, 1);
    assert.equal(
      messages(entries).filter(
        (message) => message.activityLabel === "Background job · completed",
      ).length,
      1,
    );
    assert.ok(
      !messages(entries).some((message) =>
        message.text.startsWith("Background job result ("),
      ),
    );
    assert.equal(
      entries.filter(
        (entry) =>
          entry.kind ===
          `console.job-${delivery === "context" ? "context" : "follow-up"}`,
      ).length,
      delivery === "display" ? 0 : 1,
    );
    const owned = await harness.commit(
      (tx) => tx.scanConversations({ ownerTaskId: id }, 1),
      context,
    );
    const ownedConversation = owned.items[0];
    assert.ok(ownedConversation);
    const child = await harness.conversation(ownedConversation.id, context);
    assert.ok(child);
    assert.ok(
      (await child.entries({}, 100, undefined, context)).items.some(
        (entry) => entry.kind === "console.post-run-check",
      ),
    );
    await f.app.close();
    f = await fixture(directory);
    ({ harness } = await f.service.session(sessionId));
    assert.equal(
      (
        await (await harness.root(context)).entries({}, 100, undefined, context)
      ).items.filter(BackgroundJobEntry.is).length,
      1,
    );
  });
}

test("recurring jobs create separate workers and stop on an empty answer", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-recurring-job-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory, (faux) =>
    faux.setResponses([
      fauxAssistantMessage("First"),
      fauxAssistantMessage(""),
    ]),
  );
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const agent = captureJobAgent(await root.agent(context));
  const id = await root.commit(
    (tx) =>
      tx.createTask(
        RecurringJob,
        {
          job: { agent, at: 0, content: "Work", delivery: "display" },
          recurrence: { intervalMs: 1, occurrences: 3 },
        },
        { ownership: { kind: "conversation" }, background: true },
      ),
    context,
  );
  harness.resume();
  const result = await harness.waitForTask(id, context);
  assert.equal(result.state.outcome?.status, "failed");
  assert.equal(f.faux.state.callCount, 2);
  const reports = (
    await root.entries({}, 100, undefined, context)
  ).items.filter(BackgroundJobEntry.is);
  assert.equal(reports.length, 2);
  assert.notEqual(
    reports[0]?.data.conversationId,
    reports[1]?.data.conversationId,
  );
});

test("job API deduplicates admission and scopes cancellation, including an active worker", {
  timeout: 10000,
}, async (t) => {
  const { randomUUID } = await import("node:crypto");
  const directory = await mkdtemp(join(tmpdir(), "console-job-api-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
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
      return fauxAssistantMessage("", { stopReason: "aborted" });
    },
  ]);
  const url = `/v1/sessions/${sessionId}/conversations/${root.id}/jobs`;
  const payload = { content: "Work", requestId: randomUUID() };
  const created = await f.app.inject({ method: "POST", url, payload });
  assert.equal(created.statusCode, 202, created.body);
  assert.deepEqual(
    (await f.app.inject({ method: "POST", url, payload })).json(),
    created.json(),
  );
  await started.promise;
  const active = (
    await f.app.inject(
      `/v1/sessions/${sessionId}/conversations/${root.id}/tasks`,
    )
  ).json();
  const job = active.tasks.find(
    (task: { id: number }) => task.id === created.json().id,
  );
  assert.equal(job.job, true);
  assert.equal(job.stoppable, true);
  assert.equal(job.jobTaskId, created.json().id);

  await f.service.stopConversation(sessionId, String(root.id));
  assert.equal(aborted, false);
  const sibling = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `/v1/sessions/${sessionId}/conversations/${sibling.id}/jobs/${created.json().id}`,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `${url}/${created.json().id}`,
      })
    ).statusCode,
    200,
  );
  assert.equal(aborted, true);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        payload: {
          ...payload,
          requestId: randomUUID(),
          recurrence: { intervalMs: 0, occurrences: 2 },
        },
      })
    ).statusCode,
    400,
  );
});

for (const repaired of [true, false]) {
  test(`job reports the final ${repaired ? "repaired" : "failed"} outcome once after restarting during repair`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-job-validation-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    let { harness } = await f.service.session(sessionId);
    let root = await harness.root(context);
    await root.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    const started = Promise.withResolvers<void>();
    const write = (content: string) =>
      fauxAssistantMessage(
        fauxToolCall("write", { path: "result.txt", content }),
        { stopReason: "toolUse" },
      );
    f.faux.setResponses([
      write("broken"),
      fauxAssistantMessage("Initial answer."),
      async (_request, options) => {
        started.resolve();
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) resolve();
          else
            options?.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            });
        });
        return fauxAssistantMessage("Interrupted repair.");
      },
    ]);
    const agent = captureJobAgent(await root.agent(context));
    const id = await root.commit(
      (tx) =>
        tx.createTask(
          BackgroundJob,
          {
            agent,
            at: 0,
            content: "Write the result",
            delivery: "context",
            postRun: { command: "grep -q fixed result.txt", repairLimit: 1 },
          },
          { ownership: { kind: "conversation" }, background: true },
        ),
      context,
    );
    harness.resume();
    await started.promise;
    assert.equal(
      (await root.entries({}, 100, undefined, context)).items.filter(
        BackgroundJobEntry.is,
      ).length,
      0,
    );
    await f.app.close();
    f = await fixture(directory, (faux) =>
      faux.setResponses(
        repaired
          ? [write("fixed"), fauxAssistantMessage("Final repaired answer.")]
          : [fauxAssistantMessage("Final unsuccessful answer.")],
      ),
    );
    ({ harness } = await f.service.session(sessionId));
    const result = await harness.waitForTask(id, context);
    assert.equal(result.state.outcome?.result, repaired);
    root = await harness.root(context);
    const entries = (await root.entries({}, 100, undefined, context)).items;
    const reports = entries.filter(BackgroundJobEntry.is);
    assert.equal(reports.length, 1);
    const report = reports[0];
    assert.ok(report);
    assert.equal(reports[0]?.data.status, repaired ? "completed" : "failed");
    assert.match(
      report.data.text,
      repaired ? /Final repaired answer/ : /Post-run validation did not pass/,
    );
    assert.doesNotMatch(report.data.text, /Initial answer/);
    const delivered = entries.filter(
      (entry) => entry.kind === "console.job-context",
    );
    assert.equal(delivered.length, 1);
    assert.match(
      JSON.stringify(delivered),
      repaired ? /Final repaired answer/ : /Post-run validation did not pass/,
    );
    await f.app.close();
    f = await fixture(directory);
    ({ harness } = await f.service.session(sessionId));
    root = await harness.root(context);
    assert.equal(
      (await root.entries({}, 100, undefined, context)).items.filter(
        BackgroundJobEntry.is,
      ).length,
      1,
    );
  });
}

test("recurrence stops after a written answer whose post-run validation fails", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-recurring-check-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory, (faux) =>
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("write", { path: "result.txt", content: "broken" }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Written."),
    ]),
  );
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const agent = captureJobAgent(await root.agent(context));
  const id = await root.commit(
    (tx) =>
      tx.createTask(
        RecurringJob,
        {
          job: {
            agent,
            at: 0,
            content: "Write",
            delivery: "display",
            postRun: { command: "exit 1" },
          },
          recurrence: { intervalMs: 1, occurrences: 3 },
        },
        { ownership: { kind: "conversation" }, background: true },
      ),
    context,
  );
  const result = await harness.waitForTask(id, context);
  assert.equal(result.state.outcome?.status, "failed");
  assert.deepEqual(result.state.outcome?.result, {
    completed: 1,
    succeeded: false,
  });
  assert.equal(f.faux.state.callCount, 2);
  const reports = (
    await root.entries({}, 100, undefined, context)
  ).items.filter(BackgroundJobEntry.is);
  assert.equal(reports.length, 1);
  assert.equal(reports[0]?.data.status, "failed");
});

for (const stop of [false, true]) {
  test(`job ${stop ? "cancellation" : "restart"} during its check never reports success`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(
      join(tmpdir(), "console-job-check-interruption-"),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory, (faux) =>
      faux.setResponses([
        fauxAssistantMessage(
          fauxToolCall("write", { path: "result.txt", content: "result" }),
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("Initial answer."),
      ]),
    );
    t.after(() => f.app.close());
    const { sessionId } = await f.service.createStandalone();
    let { harness } = await f.service.session(sessionId);
    let root = await harness.root(context);
    await root.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    const agent = captureJobAgent(await root.agent(context));
    const id = await root.commit(
      (tx) =>
        tx.createTask(
          BackgroundJob,
          {
            agent,
            at: 0,
            content: "Write",
            delivery: "followUp",
            postRun: {
              command: "printf started > checking; sleep 60",
              repairLimit: 1,
            },
          },
          { ownership: { kind: "conversation" }, background: true },
        ),
      context,
    );
    harness.resume();
    const marker = join(
      directory,
      "sessions",
      "workspaces",
      sessionId,
      "checking",
    );
    let checking = false;
    for (let attempt = 0; attempt < 500; attempt++) {
      checking = await readFile(marker).then(
        () => true,
        () => false,
      );
      if (checking) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(checking, "check started");
    assert.equal(
      (await root.entries({}, 100, undefined, context)).items.filter(
        BackgroundJobEntry.is,
      ).length,
      0,
    );
    if (stop) await harness.abortTask(id, context);
    else {
      await f.app.close();
      f = await fixture(directory, (faux) =>
        faux.setResponses([
          fauxAssistantMessage("Parent acknowledges failed validation."),
        ]),
      );
      ({ harness } = await f.service.session(sessionId));
      root = await harness.root(context);
    }
    const result = await harness.waitForTask(id, context);
    assert.equal(result.state.outcome?.status, stop ? "aborted" : "completed");
    if (!stop) assert.equal(result.state.outcome?.result, false);
    const entries = (await root.entries({}, 100, undefined, context)).items;
    const reports = entries.filter(BackgroundJobEntry.is);
    assert.equal(reports.length, 1);
    const report = reports[0];
    assert.ok(report);
    assert.equal(reports[0]?.data.status, stop ? "cancelled" : "failed");
    assert.equal(
      entries.filter((entry) => entry.kind === "console.job-follow-up").length,
      stop ? 0 : 1,
    );
  });
}

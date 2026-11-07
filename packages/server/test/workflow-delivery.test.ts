import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

for (const delivery of ["display", "context", "followUp"] as const) {
  test(`background review ${delivery} delivery persists without duplicate reports`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-review-delivery-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const project = await f.projects.register("Review", directory);
    const { sessionId } = (await f.service.list(project.id)).sessions[0];
    let { harness } = await f.service.session(sessionId);
    let root = await harness.root(context);
    await root.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    f.faux.setResponses([
      fauxAssistantMessage("The parser accepts an empty token."),
      (request) => {
        assert.match(
          JSON.stringify(request.messages),
          /The parser accepts an empty token/,
        );
        return fauxAssistantMessage("I assessed the finding.");
      },
    ]);
    const path = `/v1/sessions/${sessionId}/conversations/${root.id}`;
    const payload = {
      brief: "Review parser",
      requestId: randomUUID(),
      delivery,
    };
    const response = await f.app.inject({
      method: "POST",
      url: `${path}/reviews`,
      payload,
    });
    assert.equal(response.statusCode, 202, response.body);
    await harness.waitForTask(response.json().id as TaskId, context);
    await harness.waitForIdle(context);
    assert.equal(f.faux.state.callCount, delivery === "followUp" ? 2 : 1);
    const visible = (await f.app.inject(`${path}/history`)).json().messages;
    assert.equal(
      visible.filter(
        (m: { activityLabel?: string }) =>
          m.activityLabel === "Background review · completed",
      ).length,
      1,
    );
    const active = JSON.stringify((await root.context(context)).messages);
    assert.equal(
      active.includes("The parser accepts an empty token."),
      delivery !== "display",
    );
    await f.app.close();
    f = await fixture(directory);
    ({ harness } = await f.service.session(sessionId));
    root = await harness.root(context);
    const retried = await f.app.inject({
      method: "POST",
      url: `${path}/reviews`,
      payload,
    });
    assert.deepEqual(retried.json(), response.json());
    await harness.waitForIdle(context);
    assert.equal(f.faux.state.callCount, 0);
    assert.equal(
      JSON.stringify((await root.context(context)).messages).includes(
        "The parser accepts an empty token.",
      ),
      delivery !== "display",
    );
  });
}

for (const repairSucceeds of [true, false]) {
  test(`post-run repair ${repairSucceeds ? "passes" : "stops at its bound"} and exposes check results to the model`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-repair-loop-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const f = await fixture(directory);
    t.after(() => f.app.close());
    const project = await f.projects.register("Repair", directory);
    const { sessionId } = (await f.service.list(project.id)).sessions[0];
    const { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    const id = String(root.id);
    const config = await f.service.configuration(sessionId, id);
    await f.service.configureConversation(sessionId, id, {
      revision: config.revision,
      postRunCommand: "grep -q fixed example.txt",
      postRunRepairLimit: 2,
    });
    const write = (content: string) =>
      fauxAssistantMessage(
        fauxToolCall("write", { path: "example.txt", content }),
        { stopReason: "toolUse" },
      );
    f.faux.setResponses([
      write("broken"),
      fauxAssistantMessage("Edited."),
      (request) => {
        assert.match(JSON.stringify(request.messages), /Post-run check failed/);
        assert.match(
          JSON.stringify(request.messages),
          /automatic repair attempt 1 of 2/,
        );
        return repairSucceeds
          ? write("fixed")
          : fauxAssistantMessage("I have not fixed it.");
      },
      repairSucceeds
        ? fauxAssistantMessage("Fixed.")
        : (request) => {
            assert.match(
              JSON.stringify(request.messages),
              /automatic repair attempt 2 of 2/,
            );
            return fauxAssistantMessage("Still not fixed.");
          },
    ]);
    await f.service.submit(sessionId, id, "Make the edit", randomUUID(), {
      model: { provider: "test", modelId: "test-model" },
    });
    await harness.waitForIdle(context);
    assert.equal(f.faux.state.callCount, 4);
    const entries = (
      await root.entries({ order: "ascending" }, 100, undefined, context)
    ).items;
    const checks = entries.filter(
      (entry) => entry.kind === "console.post-run-check",
    );
    assert.equal(checks.length, repairSucceeds ? 2 : 3);
    assert.equal(
      (checks[checks.length - 1].data as { status: string }).status,
      repairSucceeds ? "passed" : "failed",
    );
    assert.equal(
      entries.filter((entry) => entry.kind === "console.check-repair").length,
      repairSucceeds ? 1 : 2,
    );
    assert.match(
      JSON.stringify((await root.context(context)).messages),
      /Post-run check/,
    );
  });
}

test("a repair interrupted by restart keeps its attempt bound", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-repair-restart-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Repair", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const id = String(root.id);
  const config = await f.service.configuration(sessionId, id);
  await f.service.configureConversation(sessionId, id, {
    revision: config.revision,
    postRunCommand: "exit 1",
    postRunRepairLimit: 1,
  });
  const started = Promise.withResolvers<void>();
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("bash", { command: "printf changed > changed.txt; exit 2" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Command failed after writing."),
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
  await f.service.submit(sessionId, id, "Change the file", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await started.promise;
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      (request) => {
        assert.match(
          JSON.stringify(request.messages),
          /automatic repair attempt 1 of 1/,
        );
        return fauxAssistantMessage("Cannot repair this.");
      },
    ]),
  );
  const reopened = (await f.service.session(sessionId)).harness;
  await reopened.waitForIdle(context);
  assert.equal(f.faux.state.callCount, 1);
  const history = (
    await (await reopened.root(context)).entries({}, 100, undefined, context)
  ).items;
  const checks = history.filter(
    (entry) => entry.kind === "console.post-run-check",
  );
  assert.equal(checks.length, 2);
  assert.equal(
    history.filter((entry) => entry.kind === "console.check-repair").length,
    1,
  );
});

test("stopping a busy parent withdraws review follow-up but preserves the findings", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-review-stop-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Review", directory);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const id = String(root.id);
  const started = Promise.withResolvers<void>();
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
      return fauxAssistantMessage("Stopped.");
    },
    fauxAssistantMessage(
      "Keep this finding even when the follow-up is withdrawn.",
    ),
  ]);
  await f.service.submit(sessionId, id, "Wait", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await started.promise;
  const job = await f.service.scheduleReview(
    sessionId,
    id,
    "Review",
    randomUUID(),
    undefined,
    "followUp",
  );
  await harness.waitForTask(job.id as TaskId, context);
  assert.equal((await f.service.queue(sessionId, id)).length, 1);
  await f.service.stopConversation(sessionId, id);
  assert.equal((await f.service.queue(sessionId, id)).length, 0);
  assert.equal(f.faux.state.callCount, 2);
  const entries = (await root.entries({}, 100, undefined, context)).items;
  assert.equal(
    entries.filter((entry) => entry.kind === "console.background-review")
      .length,
    1,
  );
  assert.match(JSON.stringify(entries), /Keep this finding/);
  assert.doesNotMatch(
    JSON.stringify((await root.context(context)).messages),
    /Keep this finding/,
  );
});

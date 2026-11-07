import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { ToolResultEntry } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

const profile = () => ({
  id: randomUUID(),
  name: "Boundary review",
  model: { provider: "test", modelId: "reasoning-model" },
  thinkingLevel: null,
  maxTurns: 3,
  passes: 2,
  instructions: "Inspect authorization boundaries.",
});
const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) =>
  fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });

test("foreground reviews discover and capture profiles with read-only tools and bounded passes", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-foreground-profile-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const saved = profile();
  await f.service.updateReviewerProfiles(0, [saved]);
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  f.faux.setResponses([
    call("reviewer_profiles", {}),
    (request) => {
      assert.match(JSON.stringify(request.messages), new RegExp(saved.id));
      return call("review_workspace", {
        brief: "Review access checks",
        profileId: saved.id,
      });
    },
    (request, _options, _state, model) => {
      assert.equal(model.id, "reasoning-model");
      assert.match(
        JSON.stringify(request.messages),
        /Inspect authorization boundaries/,
      );
      const tools = request.messages.flatMap((message) =>
        message.role === "system" ? (message.toolsAdded ?? []) : [],
      );
      assert.deepEqual(
        tools.map((tool) => tool.name),
        ["read"],
      );
      return fauxAssistantMessage("First findings");
    },
    (request) => {
      assert.match(JSON.stringify(request.messages), /Review pass 2 of 2/);
      return fauxAssistantMessage("Final findings");
    },
    (request, _options, _state, model) => {
      assert.equal(model.id, "test-model");
      assert.match(JSON.stringify(request.messages), /Final findings/);
      return fauxAssistantMessage("Review delivered");
    },
  ]);
  const submitted = await root.submit(
    { type: "input", content: "Review" },
    context,
  );
  assert.equal((await submitted.wait(context)).status, "done");
  assert.equal(f.faux.state.callCount, 5);
});

test("foreground profile recovery reuses the child after profile deletion", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-foreground-reopen-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const saved = { ...profile(), passes: 1 };
  await f.service.updateReviewerProfiles(0, [saved]);
  const { sessionId } = await f.service.createStandalone();
  let { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const started = Promise.withResolvers<void>();
  f.faux.setResponses([
    call("review_workspace", { brief: "Review", profileId: saved.id }),
    async (_request, options) => {
      started.resolve();
      await new Promise<void>((resolve) => {
        if (options?.signal?.aborted) resolve();
        else
          options?.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
      });
      return fauxAssistantMessage("Interrupted", { stopReason: "aborted" });
    },
  ]);
  const submitted = await root.submit(
    { type: "input", content: "Review" },
    context,
  );
  await started.promise;
  await f.service.updateReviewerProfiles(1, []);
  await f.app.close();
  f = await fixture(directory, (faux) =>
    faux.setResponses([
      (request, _options, _state, model) => {
        assert.equal(model.id, "reasoning-model");
        assert.match(
          JSON.stringify(request.messages),
          /Inspect authorization boundaries/,
        );
        return fauxAssistantMessage("Recovered review");
      },
      fauxAssistantMessage("Delivered"),
    ]),
  );
  ({ harness } = await f.service.session(sessionId));
  const resumed = await harness.submission(submitted.id, context);
  assert.ok(resumed);
  assert.equal((await resumed.wait(context)).status, "done");
  assert.equal(f.faux.state.callCount, 2);
});

test("foreground review rejects unknown profiles and conflicting overrides without running a child", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "console-foreground-invalid-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const saved = profile();
  await f.service.updateReviewerProfiles(0, [saved]);
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const invalid: Parameters<typeof fauxToolCall>[1][] = [
    { profileId: randomUUID() },
    { profileId: saved.id, passes: 3 },
  ];
  for (const args of invalid) {
    f.faux.setResponses([
      call("review_workspace", { brief: "Review", ...args }),
      fauxAssistantMessage("Cannot run review"),
    ]);
    const submitted = await root.submit(
      { type: "input", content: "Review" },
      context,
    );
    assert.equal((await submitted.wait(context)).status, "done");
  }
  const results = (
    await root.entries({}, 100, undefined, context)
  ).items.filter(ToolResultEntry.is);
  assert.equal(results.length, 2);
  assert.ok(
    results.every((entry) =>
      entry.model?.some(
        (message) => message.role === "toolResult" && message.isError,
      ),
    ),
  );
});

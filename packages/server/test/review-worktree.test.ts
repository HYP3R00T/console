import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { ConversationId, TaskId } from "@earendil-works/pi-durable";
import { BackgroundReviewEntry } from "../src/harnesses/background-review.ts";
import { ReviewWorkspace } from "../src/harnesses/reviewer.ts";
import { fixture } from "./support/harness-fixture.ts";

for (const sandbox of [false, true]) {
  test(`dedicated review worktree (sandbox ${sandbox}) survives restart, preserves the parent workspace and fails closed when moved`, {
    timeout: 10000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-review-worktree-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const projectPath = join(directory, "project"),
      linked = join(directory, "review");
    await mkdir(projectPath);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: projectPath, stdio: "ignore" });
    git("init", "-q");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-qm",
      "initial",
    );
    git("worktree", "add", "-q", "-b", "review", linked);
    await writeFile(join(projectPath, "evidence.txt"), "parent evidence");
    await writeFile(join(linked, "evidence.txt"), "dedicated review evidence");
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const project = await f.projects.register("Review", projectPath);
    const { sessionId } = (await f.service.list(project.id)).sessions[0];
    let { harness } = await f.service.session(sessionId);
    let parent = await harness.root(context);
    await parent.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    const url = `/v1/sessions/${sessionId}/conversations/${parent.id}/reviews`;
    if (sandbox) {
      const configurationUrl = url.replace(/reviews$/, "configuration");
      const configuration = await f.app.inject({ url: configurationUrl });
      const enabled = await f.app.inject({
        method: "PATCH",
        url: configurationUrl,
        payload: { revision: configuration.json().revision, sandbox: true },
      });
      assert.equal(enabled.statusCode, 200, enabled.body);
    }
    const payload = {
      brief: "Read evidence.txt",
      requestId: randomUUID(),
      worktree: linked,
      at: Date.now() + 700,
    };
    const scheduled = await f.app.inject({ method: "POST", url, payload });
    assert.equal(scheduled.statusCode, 202, scheduled.body);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url,
          payload: {
            ...payload,
            requestId: randomUUID(),
            worktree: projectPath,
          },
        })
      ).statusCode,
      400,
    );
    await f.app.close();
    f = await fixture(directory, (faux) =>
      faux.setResponses([
        fauxAssistantMessage(fauxToolCall("read", { path: "evidence.txt" }), {
          stopReason: "toolUse",
        }),
        (request) => {
          assert.match(
            JSON.stringify(request.messages),
            /dedicated review evidence/,
          );
          assert.doesNotMatch(
            JSON.stringify(request.messages),
            /parent evidence/,
          );
          return fauxAssistantMessage("Dedicated checkout reviewed");
        },
      ]),
    );
    ({ harness } = await f.service.session(sessionId));
    parent = await harness.root(context);
    await harness.waitForTask(scheduled.json().id as TaskId, context);
    const reports = (
      await parent.entries({}, 100, undefined, context)
    ).items.filter(BackgroundReviewEntry.is);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].data.status, "completed");
    const reviewId = reports[0].data.reviewId as ConversationId;
    assert.equal(
      (await harness.snapshot(ReviewWorkspace, reviewId, context))?.worktree,
      linked,
    );
    assert.equal(
      (await f.service.configuration(sessionId, String(parent.id))).worktree,
      null,
    );
    assert.equal(
      await readFile(join(projectPath, "evidence.txt"), "utf8"),
      "parent evidence",
    );
    const missing = await f.app.inject({
      method: "POST",
      url,
      payload: { ...payload, requestId: randomUUID(), at: Date.now() + 500 },
    });
    assert.equal(missing.statusCode, 202, missing.body);
    await rename(linked, `${linked}-moved`);
    const stopped = await harness.waitForTask(
      missing.json().id as TaskId,
      context,
    );
    assert.deepEqual(stopped.state.outcome, {
      status: "completed",
      result: false,
    });
    const finished = (
      await parent.entries({}, 100, undefined, context)
    ).items.filter(BackgroundReviewEntry.is);
    assert.equal(finished.length, 2);
    assert.equal(
      finished.filter((report) => report.data.status === "failed").length,
      1,
    );
    assert.equal(f.faux.state.callCount, 2);
  });
}

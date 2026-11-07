import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { SandboxDoc } from "../src/execution/sandbox.ts";
import {
  assertJobEnvironment,
  type JobEnvironment,
} from "../src/harnesses/job-workspace.ts";
import { fixture } from "./support/harness-fixture.ts";

for (const sandbox of [false, true]) {
  test(`job workspace (sandbox ${sandbox}) survives restart and supports writes`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-job-env-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const workspace = join(directory, "workspace");
    await mkdir(workspace);
    let f = await fixture(directory);
    t.after(() => f.app.close());
    const project = await f.projects.register("Job workspace", workspace);
    const session = (await f.service.list(project.id)).sessions[0];
    assert.ok(session);
    const { sessionId } = session;
    let { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    await root.configure(
      { model: { provider: "test", modelId: "test-model" } },
      context,
    );
    if (sandbox) {
      const path = `/v1/sessions/${sessionId}/conversations/${root.id}/configuration`;
      const configuration = await f.app.inject(path);
      const enabled = await f.app.inject({
        method: "PATCH",
        url: path,
        payload: { revision: configuration.json().revision, sandbox: true },
      });
      if (
        enabled.statusCode === 409 &&
        process.env.CONSOLE_REQUIRE_SANDBOX_TEST !== "1"
      ) {
        assert.match(enabled.body, /Linux Bubblewrap/);
        t.skip("Host does not permit Bubblewrap namespaces");
        return;
      }
      assert.equal(enabled.statusCode, 200, enabled.body);
    }
    const job = await f.service.scheduleJob(
      sessionId,
      String(root.id),
      "Write the worker marker",
      randomUUID(),
      Date.now() + 500,
    );
    await f.app.close();
    f = await fixture(directory, (faux) =>
      faux.setResponses([
        fauxAssistantMessage(
          fauxToolCall("write", {
            path: "worker.txt",
            content: "written by job",
          }),
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage("Done"),
      ]),
    );
    ({ harness } = await f.service.session(sessionId));
    const receipt = await harness.waitForTask(job.id as TaskId, context);
    assert.equal(receipt.state.outcome?.status, "completed");
    assert.equal(
      await readFile(join(workspace, "worker.txt"), "utf8"),
      "written by job",
    );
  });
}

test("job rejects a changed execution policy before a provider request", {
  timeout: 10000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-job-env-change-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = await fixture(directory, (faux) =>
    faux.setResponses([fauxAssistantMessage("Must not run")]),
  );
  t.after(() => f.app.close());
  const { sessionId } = await f.service.createStandalone();
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  await root.configure(
    { model: { provider: "test", modelId: "test-model" } },
    context,
  );
  const job = await f.service.scheduleJob(
    sessionId,
    String(root.id),
    "Work",
    randomUUID(),
    Date.now() + 200,
  );
  await root.commit(async (tx) => {
    (await tx.doc(SandboxDoc, root.id)).enabled = true;
  }, context);
  const result = await harness.waitForTask(job.id as TaskId, context);
  assert.equal(result.state.outcome?.status, "completed");
  assert.equal(result.state.outcome?.result, false);
  assert.equal(f.faux.state.callCount, 0);
});

test("job policy rejects changes to directory, worktree, sandbox and SSH identity", () => {
  const policy: JobEnvironment = {
    directory: "/workspace",
    worktree: null,
    sandbox: false,
    remoteProfile: null,
    remoteIdentity: null,
  };
  assert.doesNotThrow(() => assertJobEnvironment(policy, { ...policy }));
  for (const change of [
    { directory: "/other" },
    { worktree: "/linked" },
    { sandbox: true },
    { remoteProfile: "host" },
    { remoteIdentity: "new-host" },
  ])
    assert.throws(
      () => assertJobEnvironment(policy, { ...policy, ...change }),
      /policy changed/,
    );
});

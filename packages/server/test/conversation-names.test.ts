import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { ConversationInfo } from "../src/harnesses/documents.ts";
import { fixture } from "./support/harness-fixture.ts";

test("renaming project and standalone conversations preserves identity/history and survives restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-conversation-names-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "project");
  mkdirSync(path);
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", path);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  f.faux.setResponses([fauxAssistantMessage("Saved answer")]);
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "Keep this input",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await harness.waitForIdle(context);
  const before = await f.service.history(session.sessionId, String(root.id));
  const info = await harness.snapshot(ConversationInfo, root.id, context);
  const route = `/v1/sessions/${session.sessionId}/conversations/${root.id}`;
  const result = await f.app.inject({
    method: "PUT",
    url: route,
    payload: { name: "  Investigation  " },
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.json(), { id: root.id, name: "Investigation" });
  const renamed = await harness.snapshot(ConversationInfo, root.id, context);
  assert.equal(renamed?.createdAt, info?.createdAt);
  assert.equal(renamed?.lastSubmissionId, info?.lastSubmissionId);
  assert.deepEqual(
    await f.service.history(session.sessionId, String(root.id)),
    before,
  );
  const standalone = await f.service.createStandalone();
  const initial = await f.service.standalone(standalone.sessionId);
  await f.service.renameConversation(
    standalone.sessionId,
    String(initial.conversationId),
    "Standalone notes",
  );
  assert.equal(
    (await f.service.standalone(standalone.sessionId)).session.name,
    "Standalone notes",
  );
  assert.equal(
    (await f.app.inject("/v1/standalone")).json().sessions[0].name,
    "Standalone notes",
  );
  await f.app.close();
  f = await fixture(directory);
  assert.equal(
    (await f.service.conversations(session.sessionId)).conversations[0].name,
    "Investigation",
  );
  assert.equal(
    (await f.service.standalone(standalone.sessionId)).session.name,
    "Standalone notes",
  );
  assert.equal(
    (await f.service.standalone(standalone.sessionId)).conversationId,
    initial.conversationId,
  );
  assert.deepEqual(
    await f.service.history(session.sessionId, String(root.id)),
    before,
  );
  for (const payload of [
    { name: " " },
    { name: "x".repeat(121) },
    { name: "Valid", other: true },
    {},
  ]) {
    assert.equal(
      (await f.app.inject({ method: "PUT", url: route, payload })).statusCode,
      400,
    );
  }
  mkdirSync(join(directory, "other"));
  const secondProject = await f.projects.register(
    "Other project",
    join(directory, "other"),
  );
  const second = await f.service.create(secondProject.id);
  const extra = await f.service.addConversation(session.sessionId);
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: `/v1/sessions/${second.sessionId}/conversations/${extra.id}`,
        payload: { name: "Wrong session" },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: `/v1/sessions/${randomUUID()}/conversations/1`,
        payload: { name: "Unknown" },
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: route,
        headers: { origin: "https://untrusted.example" },
        payload: { name: "Forbidden" },
      })
    ).statusCode,
    403,
  );
  await f.app.inject({ method: "DELETE", url: `/v1/projects/${project.id}` });
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: route,
        payload: { name: "Archived" },
      })
    ).statusCode,
    404,
  );
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { fixture } from "./support/harness-fixture.ts";

test("archive hides project/standalone chats, gates all access, restores identity and survives restart", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "console-archives-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "project"));
  let f = await fixture(dir);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", join(dir, "project"));
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  f.faux.setResponses([fauxAssistantMessage("saved answer")]);
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "saved prompt",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await harness.waitForIdle(context);
  const before = await f.service.history(session.sessionId, String(root.id));
  const url = `/v1/sessions/${session.sessionId}/conversations/${root.id}`;
  assert.equal(
    (await f.app.inject({ method: "POST", url: `${url}/archive`, payload: {} }))
      .statusCode,
    200,
  );
  assert.equal(
    (await f.service.conversations(session.sessionId)).conversations.length,
    0,
  );
  assert.equal((await f.app.inject(`${url}/history`)).statusCode, 404);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${url}/messages`,
        payload: { content: "no", requestId: randomUUID() },
      })
    ).statusCode,
    404,
  );
  const standalone = await f.service.createStandalone();
  const single = await f.service.standalone(standalone.sessionId);
  await f.service.archiveConversation(
    standalone.sessionId,
    String(single.conversationId),
    false,
  );
  assert.equal((await f.service.listStandalone()).sessions.length, 0);
  await f.app.close();
  f = await fixture(dir);
  assert.equal(
    (await f.service.archivedConversations()).conversations.length,
    2,
  );
  await f.service.restoreConversation(session.sessionId, String(root.id));
  assert.deepEqual(
    await f.service.history(session.sessionId, String(root.id)),
    before,
  );
  assert.equal(
    (await f.app.inject({ method: "DELETE", url: `${url}/archive` }))
      .statusCode,
    404,
  );
  await f.service.archiveConversation(
    session.sessionId,
    String(root.id),
    false,
  );
  assert.equal(
    (await f.app.inject({ method: "DELETE", url: `${url}/archive` }))
      .statusCode,
    200,
  );
  assert.equal(
    (await f.app.inject({ method: "POST", url: `${url}/restore`, payload: {} }))
      .statusCode,
    404,
  );
  const db = new DatabaseSync(
    join(dir, "sessions", `${session.sessionId}.sqlite`),
  );
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM entries WHERE conversation_id=?")
      .get(root.id)?.n,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM documents WHERE scope_kind='conversation' AND owner_id=?",
      )
      .get(root.id)?.n,
    0,
  );
  db.close();
  await f.app.close();
  f = await fixture(dir);
  assert.equal(
    (await f.service.conversations(session.sessionId)).conversations.length,
    0,
  );
});

test("permanent deletion refuses to break forks and preserves sibling history", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "console-archive-forks-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "project"));
  const f = await fixture(dir);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", join(dir, "project"));
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  f.faux.setResponses([fauxAssistantMessage("answer")]);
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "keep me",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await harness.waitForIdle(context);
  const page = await root.entries({}, 1, undefined, context);
  const fork = await root.fork(
    page.items[0].id,
    { ownership: { kind: "ownerless" } },
    context,
  );
  await f.service.archiveConversation(
    session.sessionId,
    String(root.id),
    false,
  );
  await assert.rejects(
    () =>
      f.service.deleteArchivedConversation(session.sessionId, String(root.id)),
    /depend/,
  );
  const reopened = await f.service.session(session.sessionId);
  const child = await reopened.harness.conversation(fork.id, context);
  assert.ok((await child?.entries({}, 50, undefined, context))?.items.length);
  await f.service.archiveConversation(
    session.sessionId,
    String(fork.id),
    false,
  );
  await f.service.deleteArchivedConversation(
    session.sessionId,
    String(fork.id),
  );
  await f.service.deleteArchivedConversation(
    session.sessionId,
    String(root.id),
  );
});

test("interrupted erasure stays non-restorable and can be retried", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "console-archive-retry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await fixture(dir);
  t.after(() => f.app.close());
  const session = await f.service.createStandalone();
  const root = await f.service.standalone(session.sessionId);
  await f.service.archiveConversation(
    session.sessionId,
    String(root.conversationId),
    false,
  );
  f.service.archives.deleting(session.sessionId, root.conversationId);
  await assert.rejects(
    () =>
      f.service.restoreConversation(
        session.sessionId,
        String(root.conversationId),
      ),
    /not found/,
  );
  assert.equal(
    (await f.service.archivedConversations()).conversations.length,
    1,
  );
  await f.service.deleteArchivedConversation(
    session.sessionId,
    String(root.conversationId),
  );
  assert.equal(
    (await f.service.archivedConversations()).conversations.length,
    0,
  );
});

test("busy archive requires explicit stop, withdraws queued work and leaves siblings available", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "console-archive-busy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await fixture(dir);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", dir);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(session.sessionId);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.faux.setResponses([
    async (_messages, options) => {
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
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "work",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await started;
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "waiting",
    randomUUID(),
  );
  await assert.rejects(
    () =>
      f.service.archiveConversation(session.sessionId, String(root.id), false),
    /running or queued/,
  );
  await f.service.archiveConversation(session.sessionId, String(root.id), true);
  assert.equal(
    (await f.service.conversations(session.sessionId)).conversations[0].id,
    sibling.id,
  );
  await f.service.restoreConversation(session.sessionId, String(root.id));
  assert.equal(
    (await f.service.queue(session.sessionId, String(root.id))).length,
    0,
  );
});

test("archived project blocks restoration but permits permanent erasure of an individually archived chat", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "console-archive-project-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = await fixture(dir);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", dir);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  await f.service.archiveConversation(
    session.sessionId,
    String(root.id),
    false,
  );
  await f.projects.archive(project.id);
  assert.equal(
    (await f.service.archivedConversations()).conversations[0].projectArchived,
    true,
  );
  await assert.rejects(() =>
    f.service.restoreConversation(session.sessionId, String(root.id)),
  );
  await f.service.deleteArchivedConversation(
    session.sessionId,
    String(root.id),
  );
  assert.equal(
    (await f.service.archivedConversations()).conversations.length,
    0,
  );
});

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineDoc,
  defineExtension,
  defineTask,
  Harness,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createCodingTools } from "@earendil-works/pi-durable/tools";
import { purgeConversation } from "../src/harnesses/purge-conversation.ts";
import { messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

const taskDocument = defineDoc({
  kind: "console.test-purge",
  version: 1,
  scope: "task",
  initial: () => ({ value: "" }),
  checkpointWhen: () => true,
});

const suspendedTask = defineTask<null, { phase: "run" }, null>({
  name: "console.test-purge",
  version: 1,
  initial: () => ({ phase: "run" }),
  phases: {
    run: (_task, runtime, ctx) =>
      runtime.sleepUntil(runtime.now() + 60_000, { phase: "run" }, ctx),
  },
  abort: (_task, runtime, ctx) =>
    runtime.commit(
      () => ({ status: "terminal", outcome: { status: "aborted" } }),
      ctx,
    ),
});

test("fresh Durable storage supports offline purge without losing unrelated history or allocated IDs", {
  timeout: 15000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-durable-storage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "evidence.txt"),
    "Evidence retained on reopen",
  );
  const path = join(directory, "purge.sqlite");
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const registry = createRegistry();
  registry.install(createCodingTools());
  registry.install(
    defineExtension({ name: "test-purge", tasks: [suspendedTask] }),
  );
  const open = async () =>
    Harness.open(
      await openNodeSqliteStorage(path),
      {
        models: f.providers.models,
        registry,
        env: () => new NodeExecutionEnv({ cwd: directory }),
      },
      context,
    );
  let harness = await open();
  t.after(() => harness.close(context));
  const root = await harness.root(context, {
    agent: {
      model: { provider: "test", modelId: "test-model" },
      instructions: "Preserve this guidance on reopen.",
    },
  });
  f.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read", { path: "evidence.txt" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Evidence reviewed"),
  ]);
  const submission = await root.submit(
    { type: "input", content: "Inspect." },
    context,
  );
  assert.equal((await submission.wait(context)).status, "done");
  const toolHistory = messages(
    (await root.entries({}, 50, undefined, context)).items,
  );
  assert.ok(
    toolHistory.some(
      (entry) =>
        entry.toolName === "read" && entry.text.includes("Evidence retained"),
    ),
  );
  const head = (await root.entries({}, 1, undefined, context)).items[0].id;
  const fork = await root.fork(
    head,
    { ownership: { kind: "ownerless" } },
    context,
  );
  const other = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  await other.submit(
    { type: "write", entry: { kind: "console.test", data: "unrelated" } },
    context,
  );
  await harness.close(context);

  const rows = (sql: string, ...params: SQLInputValue[]) => {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      return db.prepare(sql).all(...params);
    } finally {
      db.close();
    }
  };
  const tables = [
    "conversations",
    "entries",
    "submissions",
    "tasks",
    "documents",
    "document_revisions",
    "record_ids",
  ];
  const snapshot = () =>
    tables.map((table) => rows(`SELECT * FROM ${table} ORDER BY 1, 2`));
  const refuse = (diagnostic: RegExp) => {
    const before = snapshot();
    assert.throws(
      () =>
        purgeConversation(path, root.id, () =>
          assert.fail("preflight must precede the erase callback"),
        ),
      diagnostic,
    );
    assert.deepEqual(snapshot(), before);
  };
  assert.equal(
    rows("SELECT name FROM sqlite_schema WHERE type = 'table'").filter(
      ({ name }) => tables.includes(String(name)),
    ).length,
    tables.length,
  );
  assert.equal(
    rows(
      "SELECT json_extract(record, '$.parent.conversationId') AS parent FROM conversations WHERE id = ?",
      fork.id,
    )[0].parent,
    root.id,
  );
  refuse(/depend/);
  purgeConversation(path, fork.id, () => {});

  harness = await open();
  const reopened = await harness.root(context);
  assert.deepEqual(
    messages((await reopened.entries({}, 50, undefined, context)).items),
    toolHistory,
  );
  assert.equal(
    (await reopened.agent(context)).instructions,
    "Preserve this guidance on reopen.",
  );
  const taskId = await reopened.commit(
    (tx) =>
      tx.createTask(suspendedTask, null, {
        ownership: { kind: "conversation" },
      }),
    context,
  );
  const owned = await harness.createConversation(
    { ownership: { kind: "task", taskId } },
    context,
  );
  await reopened.commit(async (tx) => {
    (await tx.doc(taskDocument, taskId)).value = "owned state";
  }, context);
  await harness.close(context);
  const ownership = rows(
    "SELECT owner_conversation_id, owner_task_id FROM conversations WHERE id = ?",
    owned.id,
  )[0];
  assert.equal(ownership.owner_conversation_id, root.id);
  assert.equal(ownership.owner_task_id, taskId);
  assert.equal(
    rows("SELECT id FROM tasks WHERE status != 'terminal'")[0].id,
    taskId,
  );
  assert.equal(
    rows("SELECT id FROM submissions WHERE status IN ('queued', 'placed')")
      .length,
    0,
  );
  const taskDocs = rows(
    "SELECT d.id FROM documents d JOIN document_revisions r ON r.document_id = d.id WHERE d.scope_kind = 'task' AND d.owner_id = ?",
    taskId,
  );
  assert.ok(taskDocs.length);
  refuse(/Stop all work/);

  harness = await open();
  await harness.abortTask(taskId, context);
  const stopped = await harness.waitForTask(taskId, context);
  assert.equal(stopped.state.status, "terminal");
  assert.equal(stopped.state.outcome?.status, "aborted");
  const settledRoot = await harness.root(context);
  // Raw admissions isolate the submission predicate from the task predicate.
  const queued = await settledRoot.commit(
    (tx) =>
      tx.createSubmission({
        conversationId: root.id,
        type: "input",
        status: "queued",
      }),
    context,
  );
  await harness.close(context);
  assert.equal(
    rows("SELECT id FROM tasks WHERE status != 'terminal'").length,
    0,
  );
  assert.equal(
    rows("SELECT id FROM submissions WHERE status = 'queued'")[0].id,
    queued.id,
  );
  refuse(/Stop all work/);

  harness = await open();
  const placedRoot = await harness.root(context);
  await placedRoot.commit((tx) => tx.placeSubmission(queued.id, head), context);
  await harness.close(context);
  assert.equal(
    rows("SELECT id FROM submissions WHERE status = 'placed'")[0].id,
    queued.id,
  );
  refuse(/Stop all work/);

  harness = await open();
  await (await harness.root(context)).commit(
    (tx) =>
      tx.settleSubmission(queued.id, { status: "unanswered", reason: "test" }),
    context,
  );
  await harness.close(context);
  const ids = rows("SELECT * FROM record_ids ORDER BY id");
  const unrelated = rows(
    "SELECT * FROM entries WHERE conversation_id = ? ORDER BY id",
    other.id,
  );
  assert.ok(unrelated.length);
  const documentIds = rows(
    "SELECT id FROM documents WHERE (scope_kind = 'conversation' AND owner_id IN (?, ?)) OR (scope_kind = 'task' AND owner_id IN (SELECT id FROM tasks WHERE conversation_id IN (?, ?)))",
    root.id,
    owned.id,
    root.id,
    owned.id,
  );
  assert.ok(documentIds.length);
  purgeConversation(path, root.id, (children) =>
    assert.deepEqual(children, [owned.id]),
  );
  for (const table of ["entries", "submissions", "tasks"]) {
    assert.equal(
      rows(
        `SELECT id FROM ${table} WHERE conversation_id IN (?, ?)`,
        root.id,
        owned.id,
      ).length,
      0,
    );
  }
  for (const { id } of documentIds) {
    assert.equal(
      rows("SELECT id FROM documents WHERE id = ?", Number(id)).length,
      0,
    );
    assert.equal(
      rows(
        "SELECT document_id FROM document_revisions WHERE document_id = ?",
        Number(id),
      ).length,
      0,
    );
  }
  for (const id of [root.id, owned.id]) {
    const [row] = rows(
      "SELECT record, owner_conversation_id, owner_task_id FROM conversations WHERE id = ?",
      id,
    );
    assert.deepEqual(JSON.parse(String(row.record)), { id });
    assert.equal(row.owner_conversation_id, null);
    assert.equal(row.owner_task_id, null);
  }
  assert.deepEqual(rows("SELECT * FROM record_ids ORDER BY id"), ids);
  assert.deepEqual(
    rows(
      "SELECT * FROM entries WHERE conversation_id = ? ORDER BY id",
      other.id,
    ),
    unrelated,
  );
});

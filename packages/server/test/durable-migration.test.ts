import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  type ConversationId,
  createRegistry,
  Harness,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createCodingTools } from "@earendil-works/pi-durable/tools";
import { conversationConfiguration } from "../src/harnesses/configuration.ts";
import { purgeConversation } from "../src/harnesses/purge-conversation.ts";
import { conversationView, messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

test("Durable 1.4 history, tool results, configuration and forks survive 1.5 writes and deletion", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-durable-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = JSON.parse(
    await readFile(
      new URL("./fixtures/durable-1.4.0.json", import.meta.url),
      "utf8",
    ),
  ) as {
    rootId: number;
    forkId: number;
    schema: string;
    tables: Record<string, Record<string, string | number | null>[]>;
  };
  const path = join(directory, "legacy.sqlite");
  const db = new DatabaseSync(path);
  db.exec(legacy.schema);
  for (const [table, rows] of Object.entries(legacy.tables)) {
    for (const row of rows) {
      const keys = Object.keys(row);
      db.prepare(
        `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      ).run(...Object.values(row));
    }
  }
  const schema = (database: DatabaseSync) =>
    database
      .prepare(
        "SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
  const oldSchema = schema(db);
  const liveVersion = (database: DatabaseSync) =>
    database
      .prepare(
        "SELECT max(version) AS version FROM document_revisions WHERE document_id IN (SELECT id FROM documents WHERE json_extract(kind,'$')='pi.live')",
      )
      .get()?.version;
  assert.equal(liveVersion(db), 1);
  db.close();
  const freshPath = join(directory, "fresh.sqlite");
  const fresh = await openNodeSqliteStorage(freshPath);
  await fresh.close(context);
  const freshDb = new DatabaseSync(freshPath);
  assert.deepEqual(
    schema(freshDb),
    oldSchema,
    "reviewed offline deletion schema remains unchanged",
  );
  freshDb.close();

  const f = await fixture(directory);
  t.after(() => f.app.close());
  const registry = createRegistry();
  registry.install(createCodingTools());
  const open = async () =>
    Harness.open(
      await openNodeSqliteStorage(path),
      { models: f.providers.models, registry },
      context,
    );
  let harness = await open();
  t.after(() => harness.close(context));
  const root = await harness.root(context);
  assert.equal(root.id, legacy.rootId);
  const fork = await harness.conversation(
    legacy.forkId as ConversationId,
    context,
  );
  assert.ok(fork);
  const oldHistory = await root.entries({}, 200, undefined, context);
  assert.ok(
    messages(oldHistory.items).some(
      (entry) => entry.text === "Legacy persisted answer.",
    ),
  );
  assert.ok(
    messages(oldHistory.items).some(
      (entry) =>
        entry.toolName === "bash" &&
        entry.text.includes("legacy-migration-proof"),
    ),
  );
  assert.deepEqual(
    (await fork.entries({}, 200, undefined, context)).items,
    oldHistory.items,
  );
  const configuration = await conversationConfiguration(harness, root);
  assert.equal(configuration.instructions, "Legacy conversation guidance.");
  assert.deepEqual(
    configuration.tools.filter((tool) => tool.enabled).map((tool) => tool.name),
    ["read", "bash"],
  );
  f.faux.setResponses([
    (request) => {
      const prompt = JSON.stringify(request.messages);
      assert.ok(prompt.includes("Legacy conversation guidance."));
      assert.ok(prompt.includes("Legacy persisted answer."));
      assert.ok(prompt.includes("legacy-migration-proof"));
      return fauxAssistantMessage("Answer after migration.");
    },
  ]);
  const submission = await root.submit(
    { type: "input", content: "Continue after upgrade." },
    context,
  );
  assert.equal((await submission.wait(context)).status, "done");
  // The 1.5 default window holds exactly 50 entries while older history still exists.
  for (let index = 0; index < 55; index++)
    await root.submit(
      { type: "write", entry: { kind: "console.test", data: { index } } },
      context,
    );
  const watch = await root.watch(context);
  assert.equal(watch.value.entries.length, 50);
  assert.equal(conversationView(watch.value).hasEarlier, true);
  await watch.stop();
  await harness.close(context);
  const upgraded = new DatabaseSync(path);
  assert.equal(liveVersion(upgraded), 3);
  upgraded.close();
  harness = await open();
  const reopened = await harness.root(context);
  const history = await reopened.entries({}, 200, undefined, context);
  assert.ok(
    messages(history.items).some(
      (entry) => entry.text === "Answer after migration.",
    ),
  );
  assert.equal(
    (await conversationConfiguration(harness, reopened)).instructions,
    configuration.instructions,
  );
  await harness.close(context);
  assert.throws(
    () =>
      purgeConversation(path, root.id, () =>
        assert.fail("must check dependencies first"),
      ),
    /depend/,
  );
  purgeConversation(path, fork.id, () => {});
  purgeConversation(path, root.id, () => {});
  const erased = new DatabaseSync(path);
  for (const table of [
    "entries",
    "submissions",
    "tasks",
    "documents",
    "document_revisions",
  ])
    assert.equal(
      erased.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count,
      0,
    );
  assert.ok(
    Number(
      erased.prepare("SELECT count(*) AS count FROM record_ids").get()?.count,
    ) > 0,
  );
  erased.close();
});

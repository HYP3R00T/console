import { createRequire } from "node:module";
import { openDatabase } from "../storage/database.ts";

/** Offline adapter for pi-durable 1.4 SQLite. Never use against an open Harness.
 * Keep allocated IDs and structural conversation records so IDs cannot be reused or roots recreated.
 * Refuse cross-conversation references; callers must not destroy a fork's inherited history.
 */
export function purgeConversation(
  path: string,
  conversationId: number,
  beforeErase: () => void,
) {
  const version = createRequire(import.meta.url)(
    "@earendil-works/pi-durable/package.json",
  ).version;
  if (version !== "1.4.0")
    throw new Error(
      "Permanent deletion requires review for this Durable storage version.",
    );
  const db = openDatabase(path);
  try {
    db.exec("PRAGMA secure_delete=ON; BEGIN EXCLUSIVE");
    const dependencies = db
      .prepare(
        "SELECT id FROM conversations WHERE json_extract(record,'$.parent.conversationId')=? OR owner_conversation_id=?",
      )
      .all(conversationId, conversationId);
    if (dependencies.length)
      throw new Error(
        "Other conversations depend on this history. Archive and delete those descendants first.",
      );
    if (
      db
        .prepare("SELECT id FROM tasks WHERE status!='terminal' LIMIT 1")
        .get() ||
      db
        .prepare(
          "SELECT id FROM submissions WHERE status IN ('queued','placed') LIMIT 1",
        )
        .get()
    )
      throw new Error(
        "Stop all work in this session before permanently deleting history.",
      );
    beforeErase();
    db.exec("CREATE TEMP TABLE purge_docs (id INTEGER PRIMARY KEY)");
    db.prepare(
      "INSERT INTO purge_docs SELECT id FROM documents WHERE (scope_kind='conversation' AND owner_id=?) OR (scope_kind='task' AND owner_id IN (SELECT id FROM tasks WHERE conversation_id=?))",
    ).run(conversationId, conversationId);
    db.exec(
      "DELETE FROM document_revisions WHERE document_id IN (SELECT id FROM purge_docs); DELETE FROM documents WHERE id IN (SELECT id FROM purge_docs)",
    );
    for (const table of ["entries", "submissions", "tasks"])
      db.prepare(`DELETE FROM ${table} WHERE conversation_id=?`).run(
        conversationId,
      );
    db.prepare(
      "UPDATE conversations SET record=?, owner_conversation_id=NULL, owner_task_id=NULL WHERE id=?",
    ).run(JSON.stringify({ id: conversationId }), conversationId);
    db.exec("COMMIT; PRAGMA wal_checkpoint(TRUNCATE); VACUUM");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

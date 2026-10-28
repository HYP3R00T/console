import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { httpError } from "./providers.ts";

// Maintenance adapter for pinned pi-durable 1.4's immutable storage: call only with its harness closed.
// Preserve record_ids and next_id so removed identities can never be minted again.
export function purgeConversationDatabase(path: string, id: string) {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (manifest.dependencies["@earendil-works/pi-durable"] !== "1.4.0")
    throw httpError(
      409,
      "Conversation maintenance requires a storage-adapter review for this Pi version.",
    );
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA secure_delete=ON; BEGIN IMMEDIATE");
    const rows = db.prepare("SELECT record FROM conversations").all();
    if (
      rows.some((row) => {
        const record = JSON.parse(String(row.record));
        return (
          String(record.parent?.conversationId) === id ||
          String(record.owner?.conversationId) === id
        );
      })
    )
      throw httpError(
        409,
        "Permanently delete descendant conversations first; they depend on this history.",
      );
    const documents =
      "SELECT id FROM documents WHERE (scope_kind='conversation' AND owner_id=?) OR (scope_kind='task' AND owner_id IN (SELECT id FROM tasks WHERE conversation_id=?))";
    db.prepare(
      `DELETE FROM document_revisions WHERE document_id IN (${documents})`,
    ).run(id, id);
    db.prepare(`DELETE FROM documents WHERE id IN (${documents})`).run(id, id);
    for (const table of ["entries", "submissions", "tasks"])
      db.prepare(`DELETE FROM ${table} WHERE conversation_id=?`).run(id);
    db.prepare("DELETE FROM conversations WHERE id=?").run(id);
    db.exec("COMMIT; PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

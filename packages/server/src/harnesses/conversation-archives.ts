import type { HarnessStore } from "./store.ts";

export type ConversationArchive = {
  sessionId: string;
  conversationId: number;
  name: string;
  archivedAt: string;
  deletedAt: string | null;
};
/** Application lifecycle metadata. Durable still owns the transcript. */
export class ConversationArchives {
  private store: HarnessStore;
  constructor(store: HarnessStore) {
    this.store = store;
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS conversation_archives (sessionId TEXT NOT NULL, conversationId INTEGER NOT NULL, name TEXT NOT NULL, archivedAt TEXT NOT NULL, deletedAt TEXT, PRIMARY KEY(sessionId,conversationId))",
    );
  }
  get(sessionId: string, id: number) {
    return this.store.db
      .prepare(
        "SELECT * FROM conversation_archives WHERE sessionId=? AND conversationId=?",
      )
      .get(sessionId, id) as ConversationArchive | undefined;
  }
  list() {
    return this.store.db
      .prepare(
        "SELECT * FROM conversation_archives WHERE deletedAt IS NULL OR deletedAt='pending' ORDER BY archivedAt DESC",
      )
      .all() as ConversationArchive[];
  }
  archive(sessionId: string, id: number, name: string) {
    this.store.db
      .prepare(
        "INSERT INTO conversation_archives VALUES (?,?,?,?,NULL) ON CONFLICT(sessionId,conversationId) DO NOTHING",
      )
      .run(sessionId, id, name, new Date().toISOString());
  }
  restore(sessionId: string, id: number) {
    this.store.db
      .prepare(
        "DELETE FROM conversation_archives WHERE sessionId=? AND conversationId=? AND deletedAt IS NULL",
      )
      .run(sessionId, id);
  }
  deleting(sessionId: string, id: number, owned: number[] = []) {
    this.store.db
      .prepare(
        "UPDATE conversation_archives SET deletedAt='pending' WHERE sessionId=? AND conversationId=?",
      )
      .run(sessionId, id);
    const hide = this.store.db.prepare(
      "INSERT INTO conversation_archives VALUES (?,?,'','',?) ON CONFLICT(sessionId,conversationId) DO UPDATE SET name='', archivedAt='', deletedAt=excluded.deletedAt",
    );
    const at = new Date().toISOString();
    for (const child of owned) hide.run(sessionId, child, at);
  }
  deleted(sessionId: string, id: number) {
    this.store.db
      .prepare(
        "UPDATE conversation_archives SET name='', archivedAt='', deletedAt=? WHERE sessionId=? AND conversationId=?",
      )
      .run(new Date().toISOString(), sessionId, id);
  }
}

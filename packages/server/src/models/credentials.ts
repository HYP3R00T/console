import { randomUUID } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";

// One backend process owns this directory. Pi serializes refreshes through modify().
export async function openCredentials(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, "credentials.sqlite");
  const db = new DatabaseSync(path);
  await chmod(path, 0o600);
  // Retain an exclusive lock so a second backend cannot race OAuth token rotation.
  db.exec("PRAGMA locking_mode = EXCLUSIVE");
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    db.exec("CREATE TABLE IF NOT EXISTS installation (id TEXT PRIMARY KEY)");
    db.prepare(
      "INSERT INTO installation SELECT ? WHERE NOT EXISTS (SELECT 1 FROM installation)",
    ).run(randomUUID());
  } catch (error) {
    db.close();
    throw error;
  }
  const deviceId = String(db.prepare("SELECT id FROM installation").get()?.id);
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.catch(() => {});
    return next;
  }
  const store: CredentialStore = {
    async read(id, options) {
      options?.signal?.throwIfAborted();
      const row = db
        .prepare("SELECT value FROM credentials WHERE id = ?")
        .get(id);
      return row ? (JSON.parse(String(row.value)) as Credential) : undefined;
    },
    async list() {
      return db
        .prepare(
          "SELECT id, json_extract(value, '$.type') AS type FROM credentials",
        )
        .all()
        .map((row) => ({
          providerId: String(row.id),
          type: row.type as Credential["type"],
        }));
    },
    modify(id, change, options) {
      return serialize(async () => {
        options?.signal?.throwIfAborted();
        const current = await store.read(id, options);
        const next = await change(current);
        options?.signal?.throwIfAborted();
        if (next !== undefined)
          db.prepare("INSERT OR REPLACE INTO credentials VALUES (?, ?)").run(
            id,
            JSON.stringify(next),
          );
        return next ?? current;
      });
    },
    delete(id, options) {
      return serialize(async () => {
        options?.signal?.throwIfAborted();
        db.prepare("DELETE FROM credentials WHERE id = ?").run(id);
      });
    },
  };
  return {
    store,
    deviceId,
    async close() {
      await pending;
      db.close();
    },
  };
}

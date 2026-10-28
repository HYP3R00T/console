import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Models } from "@earendil-works/pi-ai";
import { openConversation } from "./conversation.ts";
import { httpError } from "./providers.ts";

type Session = { id: string; name: string; createdAt: string };

export async function openSessions(models: Models, directory: string) {
  const db = new DatabaseSync(join(directory, "catalog.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, requestId TEXT UNIQUE)",
  );
  try {
    // Register the original database in place. No transcript or credential files move.
    await stat(join(directory, "conversation.sqlite"));
    db.prepare(
      "INSERT OR IGNORE INTO sessions VALUES ('default', 'Original conversation', ?, NULL)",
    ).run(new Date().toISOString());
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      db.close();
      throw error;
    }
  }
  const opened = new Map<string, ReturnType<typeof openConversation>>();
  let pending: Promise<unknown> = Promise.resolve();

  function record(id: string) {
    const row = db
      .prepare("SELECT id, name, createdAt FROM sessions WHERE id = ?")
      .get(id);
    if (!row) throw httpError(404, "Session not found.");
    return row as Session;
  }
  function open(id: string) {
    let promise = opened.get(id);
    if (!promise) {
      const path =
        id === "default" ? directory : join(directory, "sessions", id);
      promise = mkdir(path, { recursive: true, mode: 0o700 }).then(() =>
        openConversation(models, path, directory),
      );
      opened.set(id, promise);
      void promise.catch(() => opened.delete(id));
    }
    return promise;
  }
  return {
    async list() {
      const rows = db
        .prepare(
          "SELECT id, name, createdAt FROM sessions ORDER BY createdAt, id",
        )
        .all() as Session[];
      return Promise.all(
        rows.map(async (row) => {
          try {
            return { ...(await (await open(row.id)).summary()), ...row };
          } catch {
            return { ...row, status: "unavailable" };
          }
        }),
      );
    },
    create(name: string, requestId: string) {
      const next = pending.then(async () => {
        if (!name.trim())
          throw httpError(400, "Session name must not be blank.");
        const existing = db
          .prepare("SELECT id FROM sessions WHERE requestId = ?")
          .get(requestId);
        if (existing) return record(String(existing.id));
        const row = {
          id: randomUUID(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
        };
        await open(row.id);
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(
          row.id,
          row.name,
          row.createdAt,
          requestId,
        );
        return row;
      });
      pending = next.catch(() => {});
      return next;
    },
    async get(id: string) {
      const row = record(id);
      return { ...(await (await open(id)).snapshot()), ...row };
    },
    conversation(id: string) {
      record(id);
      return open(id);
    },
    async close() {
      await pending;
      const results = await Promise.allSettled(
        [...opened.values()].map(async (value) => (await value).close()),
      );
      db.close();
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length)
        throw new AggregateError(
          failures.map((result) => result.reason),
          "Failed to close sessions",
        );
    },
  };
}

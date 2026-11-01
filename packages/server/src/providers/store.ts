import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type {
  AuthOperationOptions,
  Credential,
  CredentialStore,
  ModelsStore,
  ModelsStoreEntry,
} from "@earendil-works/pi-ai";
import { openDatabase } from "../storage/database.ts";

export const providerDatabasePath = () =>
  join(homedir(), ".local", "share", "console", "providers.sqlite");

export class ProviderStore implements CredentialStore {
  readonly db: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(path = ":memory:") {
    this.db = openDatabase(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, credential TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS favorites (provider TEXT NOT NULL, model TEXT NOT NULL, PRIMARY KEY(provider,model));
      CREATE TABLE IF NOT EXISTS catalogs (provider TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.db
      .prepare("INSERT OR IGNORE INTO settings VALUES ('installation', ?)")
      .run(randomUUID());
  }
  readonly installationId = () =>
    String(
      this.db
        .prepare("SELECT value FROM settings WHERE id='installation'")
        .get()?.value,
    );
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => {}).then(task);
    this.tail = result.catch(() => {});
    return result;
  }
  async read(
    id: string,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    const row = this.db
      .prepare("SELECT credential FROM providers WHERE id=?")
      .get(id);
    return row ? (JSON.parse(String(row.credential)) as Credential) : undefined;
  }
  async list() {
    return this.db
      .prepare(
        "SELECT id,json_extract(credential,'$.type') AS type FROM providers",
      )
      .all()
      .map((row) => ({
        providerId: String(row.id),
        type: row.type as Credential["type"],
      }));
  }
  modify(
    id: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ) {
    return this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const current = await this.read(id, options);
        const next = await fn(current);
        options?.signal?.throwIfAborted();
        if (next)
          this.db
            .prepare(
              "INSERT INTO providers(id,credential) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET credential=excluded.credential",
            )
            .run(id, JSON.stringify(next));
        this.db.exec("COMMIT");
        return next ?? current;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    });
  }
  delete(id: string, options?: AuthOperationOptions) {
    return this.enqueue(async () => {
      options?.signal?.throwIfAborted();
      this.db.prepare("DELETE FROM providers WHERE id=?").run(id);
    });
  }
  enabled(id: string) {
    return (
      this.db.prepare("SELECT enabled FROM providers WHERE id=?").get(id)
        ?.enabled === 1
    );
  }
  setEnabled(id: string, enabled: boolean) {
    return this.enqueue(async () => {
      this.db
        .prepare("UPDATE providers SET enabled=? WHERE id=?")
        .run(enabled ? 1 : 0, id);
    });
  }
  favorites(id?: string) {
    const rows =
      id === undefined
        ? this.db.prepare("SELECT provider,model FROM favorites").all()
        : this.db
            .prepare("SELECT provider,model FROM favorites WHERE provider=?")
            .all(id);
    return rows.map((row) => ({
      provider: String(row.provider),
      model: String(row.model),
    }));
  }
  setFavorite(provider: string, model: string, favorite: boolean) {
    return this.enqueue(async () => {
      if (favorite)
        this.db
          .prepare("INSERT OR IGNORE INTO favorites VALUES (?,?)")
          .run(provider, model);
      else
        this.db
          .prepare("DELETE FROM favorites WHERE provider=? AND model=?")
          .run(provider, model);
    });
  }
  remove(id: string) {
    return this.enqueue(async () => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        for (const sql of [
          "DELETE FROM providers WHERE id=?",
          "DELETE FROM favorites WHERE provider=?",
          "DELETE FROM catalogs WHERE provider=?",
        ])
          this.db.prepare(sql).run(id);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    });
  }
  readonly catalogs: ModelsStore = {
    read: async (id) => {
      const row = this.db
        .prepare("SELECT value FROM catalogs WHERE provider=?")
        .get(id);
      return row
        ? (JSON.parse(String(row.value)) as ModelsStoreEntry)
        : undefined;
    },
    write: (id, entry) =>
      this.enqueue(async () => {
        this.db
          .prepare(
            "INSERT INTO catalogs VALUES (?,?) ON CONFLICT(provider) DO UPDATE SET value=excluded.value",
          )
          .run(id, JSON.stringify(entry));
      }),
    delete: (id) =>
      this.enqueue(async () => {
        this.db.prepare("DELETE FROM catalogs WHERE provider=?").run(id);
      }),
  };
  async close() {
    await this.tail;
    this.db.close();
  }
}

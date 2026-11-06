import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
  DEFAULT_COMPACTION_POLICY,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { openDatabase } from "../storage/database.ts";

// Project IDs are UUIDs. This reserved owner groups machine-level conversations.
export const standaloneOwner = "";

export type HarnessRecord = {
  id: string;
  sessionId: string;
  projectId: string;
  name: string;
  createdAt: string;
  number: number;
  provider: string;
  modelId: string;
  thinkingLevel: ModelThinkingLevel | null;
};

export type RuntimeDefaults = {
  model: ModelRef;
  thinkingLevel?: ModelThinkingLevel;
};
export const harnessDataPath = () =>
  join(homedir(), ".local", "share", "console", "sessions");
export class HarnessStore {
  readonly db;
  constructor(path: string) {
    this.db = openDatabase(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS harnesses (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL UNIQUE, projectId TEXT NOT NULL, name TEXT NOT NULL, createdAt TEXT NOT NULL, provider TEXT NOT NULL, modelId TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS session_context_settings (sessionId TEXT PRIMARY KEY, keepRecentTokens INTEGER NOT NULL)",
    );
    const contextColumns = this.db
      .prepare("PRAGMA table_info(session_context_settings)")
      .all();
    if (!contextColumns.some((column) => column.name === "automatic"))
      this.db.exec(
        "ALTER TABLE session_context_settings ADD COLUMN automatic INTEGER NOT NULL DEFAULT 1",
      );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS runtime_defaults (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, provider TEXT, modelId TEXT, thinkingLevel TEXT)",
    );
    this.db.exec(
      "INSERT OR IGNORE INTO runtime_defaults (id, revision) VALUES (1, 0)",
    );
    const columns = this.db.prepare("PRAGMA table_info(harnesses)").all();
    if (!columns.some((column) => column.name === "thinkingLevel"))
      this.db.exec("ALTER TABLE harnesses ADD COLUMN thinkingLevel TEXT");
    if (!columns.some((column) => column.name === "number")) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec("ALTER TABLE harnesses ADD COLUMN number INTEGER");
        this.db.exec(
          "WITH numbered AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY projectId ORDER BY createdAt,id) AS n FROM harnesses) UPDATE harnesses SET number=(SELECT n FROM numbered WHERE numbered.id=harnesses.id)",
        );
        this.db.exec("UPDATE harnesses SET name='Session ' || number");
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS session_number ON harnesses(projectId,number)",
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS harness_project ON harnesses(projectId)",
    );
  }
  list(projectId?: string): HarnessRecord[] {
    return (
      projectId !== undefined
        ? this.db
            .prepare(
              "SELECT * FROM harnesses WHERE projectId=? ORDER BY number,id",
            )
            .all(projectId)
        : this.db
            .prepare("SELECT * FROM harnesses ORDER BY projectId,number,id")
            .all()
    ) as HarnessRecord[];
  }
  listStandalone(): HarnessRecord[] {
    return this.db
      .prepare("SELECT * FROM harnesses WHERE projectId=? ORDER BY number DESC")
      .all(standaloneOwner) as HarnessRecord[];
  }
  session(id: string) {
    return this.db
      .prepare("SELECT * FROM harnesses WHERE sessionId=?")
      .get(id) as HarnessRecord | undefined;
  }
  insert(
    projectId: string,
    provider = "",
    modelId = "",
    sessionId: string = randomUUID(),
    thinkingLevel: ModelThinkingLevel | null = null,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const number = Number(
        this.db
          .prepare(
            "SELECT COALESCE(MAX(number),0)+1 AS n FROM harnesses WHERE projectId=?",
          )
          .get(projectId)?.n,
      );
      const row = {
        id: randomUUID(),
        sessionId,
        projectId,
        name: `${projectId === standaloneOwner ? "Conversation" : "Session"} ${number}`,
        number,
        provider,
        modelId,
        thinkingLevel,
        createdAt: new Date().toISOString(),
      };
      this.db
        .prepare(
          "INSERT INTO harnesses(id,sessionId,projectId,name,createdAt,provider,modelId,number,thinkingLevel) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          row.id,
          row.sessionId,
          projectId,
          row.name,
          row.createdAt,
          provider,
          modelId,
          number,
          thinkingLevel,
        );
      this.db.exec("COMMIT");
      return row;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  runtimeDefaults(): { revision: number; defaults: RuntimeDefaults | null } {
    const row = this.db
      .prepare("SELECT * FROM runtime_defaults WHERE id=1")
      .get() as {
      revision: number;
      provider: string | null;
      modelId: string | null;
      thinkingLevel: ModelThinkingLevel | null;
    };
    return {
      revision: row.revision,
      defaults:
        row.provider && row.modelId
          ? {
              model: { provider: row.provider, modelId: row.modelId },
              thinkingLevel: row.thinkingLevel ?? undefined,
            }
          : null,
    };
  }
  setRuntimeDefaults(revision: number, defaults: RuntimeDefaults | null) {
    return (
      this.db
        .prepare(
          "UPDATE runtime_defaults SET revision=revision+1, provider=?, modelId=?, thinkingLevel=? WHERE id=1 AND revision=?",
        )
        .run(
          defaults?.model.provider ?? null,
          defaults?.model.modelId ?? null,
          defaults?.thinkingLevel ?? null,
          revision,
        ).changes === 1
    );
  }
  compaction(sessionId: string) {
    const row = this.db
      .prepare(
        "SELECT keepRecentTokens, automatic FROM session_context_settings WHERE sessionId=?",
      )
      .get(sessionId);
    return {
      keepRecentTokens: Number(
        row?.keepRecentTokens ?? DEFAULT_COMPACTION_POLICY.keepRecentTokens,
      ),
      enabled: row ? row.automatic === 1 : DEFAULT_COMPACTION_POLICY.enabled,
    };
  }
  setCompaction(sessionId: string, keepRecentTokens: number, enabled: boolean) {
    this.db
      .prepare(
        "INSERT INTO session_context_settings (sessionId, keepRecentTokens, automatic) VALUES (?,?,?) ON CONFLICT(sessionId) DO UPDATE SET keepRecentTokens=excluded.keepRecentTokens, automatic=excluded.automatic",
      )
      .run(sessionId, keepRecentTokens, Number(enabled));
  }
  close() {
    this.db.close();
  }
}

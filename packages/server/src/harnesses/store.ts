import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../storage/database.ts";

export type HarnessRecord = {
  id: string;
  sessionId: string;
  projectId: string;
  name: string;
  createdAt: string;
  number: number;
  provider: string;
  modelId: string;
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
    const columns = this.db.prepare("PRAGMA table_info(harnesses)").all();
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
      projectId
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
  session(id: string) {
    return this.db
      .prepare("SELECT * FROM harnesses WHERE sessionId=?")
      .get(id) as HarnessRecord | undefined;
  }
  insert(projectId: string, provider = "", modelId = "") {
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
        sessionId: randomUUID(),
        projectId,
        name: `Session ${number}`,
        number,
        provider,
        modelId,
        createdAt: new Date().toISOString(),
      };
      this.db
        .prepare(
          "INSERT INTO harnesses(id,sessionId,projectId,name,createdAt,provider,modelId,number) VALUES (?,?,?,?,?,?,?,?)",
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
        );
      this.db.exec("COMMIT");
      return row;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}

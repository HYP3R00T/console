import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../storage/database.ts";

export type Project = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  icon: string;
  color: string;
};
export const projectDatabasePath = () =>
  join(homedir(), ".local", "share", "console", "projects.sqlite");
export class ProjectStore {
  readonly db;
  constructor(path = ":memory:") {
    this.db = openDatabase(path);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL)",
      );
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS machine_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      const columns = new Set(
        this.db
          .prepare("PRAGMA table_info(projects)")
          .all()
          .map((row) => String(row.name)),
      );
      if (!columns.has("icon"))
        this.db.exec(
          "ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT 'folder'",
        );
      if (!columns.has("color"))
        this.db.exec(
          "ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT 'neutral'",
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  projectsRoot() {
    return String(
      this.db
        .prepare("SELECT value FROM machine_settings WHERE key='projectsRoot'")
        .get()?.value ?? join(homedir(), "Projects"),
    );
  }
  setProjectsRoot(path: string) {
    this.db
      .prepare(
        "INSERT INTO machine_settings VALUES ('projectsRoot', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(path);
  }
  byPath(path: string) {
    return this.db.prepare("SELECT * FROM projects WHERE path=?").get(path) as
      | Project
      | undefined;
  }
  list(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY createdAt, id")
      .all() as Project[];
  }
  get(id: string): Project | undefined {
    return this.db.prepare("SELECT * FROM projects WHERE id=?").get(id) as
      | Project
      | undefined;
  }
  insert(name: string, path: string): Project | undefined {
    const project = {
      id: randomUUID(),
      name,
      path,
      createdAt: new Date().toISOString(),
      icon: "folder",
      color: "neutral",
    };
    const result = this.db
      .prepare(
        "INSERT INTO projects(id,name,path,createdAt) VALUES (?,?,?,?) ON CONFLICT(path) DO NOTHING",
      )
      .run(project.id, name, path, project.createdAt);
    return result.changes ? project : undefined;
  }
  update(id: string, name: string, icon: string, color: string) {
    return (
      this.db
        .prepare("UPDATE projects SET name=?,icon=?,color=? WHERE id=?")
        .run(name, icon, color, id).changes > 0
    );
  }
  remove(id: string) {
    return (
      this.db.prepare("DELETE FROM projects WHERE id=?").run(id).changes > 0
    );
  }
  close() {
    this.db.close();
  }
}

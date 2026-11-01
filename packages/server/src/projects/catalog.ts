import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { httpError } from "../http/errors.ts";

export type Project = {
  id: string;
  name: string;
  path: string;
  requestId: string;
};

export function projectCatalog(db: DatabaseSync, privateDirectory: string) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, requestId TEXT NOT NULL UNIQUE)",
  );
  function get(id: string) {
    const row = db.prepare("SELECT * FROM projects WHERE id=?").get(id) as
      | Project
      | undefined;
    if (!row) throw httpError(404, "Project not found.");
    return row;
  }
  return {
    get,
    list: () =>
      db.prepare("SELECT * FROM projects ORDER BY name,id").all() as Project[],
    async create(input: { name: string; path: string; requestId: string }) {
      if (!isAbsolute(input.path))
        throw httpError(400, "Project path must be absolute.");
      let path: string;
      try {
        path = await realpath(input.path);
        if (!(await stat(path)).isDirectory())
          throw new Error("Not a directory");
      } catch {
        throw httpError(400, "Choose an existing directory on this machine.");
      }
      const privatePath = await realpath(privateDirectory);
      if (
        path === sep ||
        path === privatePath ||
        path.startsWith(privatePath + sep) ||
        privatePath.startsWith(path + sep)
      )
        throw httpError(400, "Projects cannot overlap Console storage.");
      const prior = db
        .prepare("SELECT * FROM projects WHERE requestId=?")
        .get(input.requestId) as Project | undefined;
      if (prior) {
        if (prior.path !== path)
          throw httpError(
            409,
            "Request ID already belongs to another project registration.",
          );
        return prior;
      }
      const existing = db
        .prepare("SELECT * FROM projects WHERE path=?")
        .get(path) as Project | undefined;
      if (existing) return existing;
      const item = {
        id: randomUUID(),
        name: input.name.trim(),
        path,
        requestId: input.requestId,
      };
      db.prepare("INSERT INTO projects VALUES (?,?,?,?)").run(
        item.id,
        item.name,
        item.path,
        item.requestId,
      );
      return item;
    },
    rename(id: string, name: string) {
      get(id);
      db.prepare("UPDATE projects SET name=? WHERE id=?").run(name.trim(), id);
      return get(id);
    },
  };
}

import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(path: string) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const fd = openSync(path, "a", 0o600);
    closeSync(fd);
    chmodSync(path, 0o600);
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout=5000");
  return db;
}

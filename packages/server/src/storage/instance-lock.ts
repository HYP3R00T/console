import { join } from "node:path";
import { openDatabase } from "./database.ts";

/** One production entrypoint per Console user directory. SQLite releases the lock on process death. */
export function claimInstance(directory: string) {
  const db = openDatabase(join(directory, "instance.sqlite"));
  try {
    db.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
  } catch (error) {
    db.close();
    const code = (error as { errcode?: number }).errcode;
    if (code !== 5 && code !== 6) throw error;
    throw new Error(
      "Console is already running for this operating-system user.",
    );
  }
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      db.close();
    }
  };
}

import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Models } from "@earendil-works/pi-ai";
import { httpError } from "../http/errors.ts";
import { projectCatalog } from "../projects/catalog.ts";
import {
  type Configuration,
  openSession,
  type RuntimeReport,
} from "../runtime/session.ts";

type Row = {
  id: string;
  projectId: string;
  name: string;
  creationName: string;
  requestId: string;
  createdAt: string;
  deleted: number;
};
type Runtime = Awaited<ReturnType<typeof openSession>>;

export async function sessionService(
  models: Models,
  provider: string,
  directory: string,
  report: (event: RuntimeReport & { sessionId?: string }) => void,
) {
  // A new MVP storage namespace leaves experimental histories untouched, without importing them.
  const home = join(directory, "mvp");
  await mkdir(home, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(home, "catalog.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, projectId TEXT NOT NULL, name TEXT NOT NULL, creationName TEXT NOT NULL, requestId TEXT NOT NULL, createdAt TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, UNIQUE(projectId,requestId))",
  );
  const projects = projectCatalog(db, directory);
  const opened = new Map<string, Promise<Runtime>>();
  const queues = new Map<string, Promise<unknown>>();
  let closing = false;
  function serialize<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (closing) return Promise.reject(httpError(503, "Server is stopping."));
    const next = (queues.get(projectId) ?? Promise.resolve()).then(operation);
    const tail = next.catch(() => {});
    queues.set(projectId, tail);
    void tail.then(() => {
      if (queues.get(projectId) === tail) queues.delete(projectId);
    });
    return next;
  }
  function record(id: string, includeDeleted = false) {
    const row = db.prepare("SELECT * FROM sessions WHERE id=?").get(id) as
      | Row
      | undefined;
    if (!row || (row.deleted && !includeDeleted))
      throw httpError(404, "Session not found.");
    return row;
  }
  function rows(projectId?: string) {
    return (
      projectId
        ? db
            .prepare(
              "SELECT * FROM sessions WHERE deleted=0 AND projectId=? ORDER BY createdAt,id",
            )
            .all(projectId)
        : db
            .prepare(
              "SELECT * FROM sessions WHERE deleted=0 ORDER BY createdAt,id",
            )
            .all()
    ) as Row[];
  }
  function open(row: Row) {
    let pending = opened.get(row.id);
    if (!pending) {
      const path = join(home, "sessions", row.id);
      pending = mkdir(path, { recursive: true, mode: 0o700 }).then(() =>
        openSession(
          models,
          provider,
          path,
          projects.get(row.projectId).path,
          (event) => report({ ...event, sessionId: row.id }),
        ),
      );
      opened.set(row.id, pending);
      void pending.catch(() => {
        if (opened.get(row.id) === pending) opened.delete(row.id);
      });
    }
    return pending;
  }
  function publicRow(row: Row) {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      createdAt: row.createdAt,
    };
  }
  async function summary(row: Row) {
    try {
      return { ...publicRow(row), ...(await (await open(row)).summary()) };
    } catch {
      report({ type: "runtime_unavailable", sessionId: row.id });
      return { ...publicRow(row), status: "unavailable" };
    }
  }
  function run<T>(id: string, operation: (row: Row) => Promise<T>) {
    const row = record(id);
    return serialize(row.projectId, () => operation(record(id)));
  }
  async function exclusive(row: Row) {
    for (const sibling of rows(row.projectId)) {
      if (sibling.id === row.id) continue;
      const state = await summary(sibling);
      if (state.status !== "idle")
        throw httpError(
          409,
          "Another session has unfinished or unavailable work in this project. Finish, recover or cancel it first.",
        );
    }
  }
  async function snapshot(row: Row) {
    try {
      const runtime = await open(row);
      return {
        ...publicRow(row),
        ...(await runtime.summary()),
        ...(await runtime.snapshot()),
      };
    } catch {
      report({ type: "runtime_unavailable", sessionId: row.id });
      return {
        ...publicRow(row),
        status: "unavailable",
        messages: [],
        hasOlder: false,
        partial: "",
        liveTools: [],
        failure:
          "Runtime unavailable. Try explicit Resume to reopen it; check server diagnostics if that fails.",
      };
    }
  }
  return {
    projects,
    list(projectId: string) {
      return serialize(projectId, async () => {
        projects.get(projectId);
        return Promise.all(rows(projectId).map(summary));
      });
    },
    create(projectId: string, input: { name: string; requestId: string }) {
      return serialize(projectId, async () => {
        projects.get(projectId);
        const prior = db
          .prepare("SELECT * FROM sessions WHERE projectId=? AND requestId=?")
          .get(projectId, input.requestId) as Row | undefined;
        if (prior) {
          if (prior.deleted)
            throw httpError(
              409,
              "This creation request belongs to a deleted session.",
            );
          if (prior.creationName !== input.name.trim())
            throw httpError(
              409,
              "Request ID belongs to a different session creation.",
            );
          return snapshot(prior);
        }
        const row: Row = {
          id: randomUUID(),
          projectId,
          name: input.name.trim(),
          creationName: input.name.trim(),
          requestId: input.requestId,
          createdAt: new Date().toISOString(),
          deleted: 0,
        };
        // Persist the identity before opening Pi: a failed open remains visible and can be retried explicitly.
        db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?,0)").run(
          row.id,
          row.projectId,
          row.name,
          row.creationName,
          row.requestId,
          row.createdAt,
        );
        return snapshot(row);
      });
    },
    get: (id: string) => run(id, snapshot),
    history: (id: string, before?: string) =>
      run(id, async (row) => (await open(row)).history(before)),
    rename: (id: string, name: string) =>
      run(id, async (row) => {
        db.prepare("UPDATE sessions SET name=? WHERE id=?").run(
          name.trim(),
          id,
        );
        return snapshot({ ...row, name: name.trim() });
      }),
    configure: (id: string, input: Configuration) =>
      run(id, async (row) => {
        await (await open(row)).configure(input);
        return snapshot(row);
      }),
    submit: (id: string, input: { text: string; requestId: string }) =>
      run(id, async (row) => {
        const runtime = await open(row);
        const prior = await runtime.duplicate(input.requestId, input.text);
        if (prior) return prior;
        await exclusive(row);
        return runtime.submit(input.text, input.requestId);
      }),
    cancel: (id: string) =>
      run(id, async (row) => {
        await (await open(row)).cancel();
      }),
    resume: (id: string) =>
      run(id, async (row) => {
        await exclusive(row);
        const cached = opened.get(id);
        if (cached) {
          const runtime = await cached;
          if (runtime.failed) {
            await runtime.close().catch(() => {});
            opened.delete(id);
          }
        }
        await (await open(row)).resume();
      }),
    remove(id: string) {
      const initial = record(id, true);
      return serialize(initial.projectId, async () => {
        const row = record(id, true);
        if (!row.deleted) {
          const runtime = await open(row);
          await runtime.idle();
          await runtime.close();
          opened.delete(id);
          db.prepare("UPDATE sessions SET deleted=1 WHERE id=?").run(id);
        }
        // Tombstone keeps creation retries from recreating erased history. Retrying DELETE completes interrupted cleanup.
        await rm(join(home, "sessions", id), { recursive: true, force: true });
      });
    },
    async close() {
      closing = true;
      await Promise.allSettled(queues.values());
      const results = await Promise.allSettled(
        [...opened.values()].map(async (runtime) => (await runtime).close()),
      );
      db.close();
      const errors = results.filter((result) => result.status === "rejected");
      if (errors.length)
        throw new AggregateError(
          errors.map((result) => result.reason),
          "Session shutdown failed.",
        );
    },
  };
}

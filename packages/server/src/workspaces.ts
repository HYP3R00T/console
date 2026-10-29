import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import type { AgentConfiguration } from "./conversation.ts";
import type { openMachineSettings } from "./machine-settings.ts";
import { httpError } from "./providers.ts";

export type Workspace = {
  id: string;
  name: string;
  path: string;
  repository: string | null;
  state: string;
  deleted: number;
  lastConfiguration: string | null;
  isDefault: number;
  error?: string | null;
};
export function cloneRepository(
  url: string,
  target: string,
  signal: AbortSignal,
) {
  return new Promise<void>((accept, reject) =>
    execFile(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "init.templateDir=",
        "-c",
        "protocol.file.allow=never",
        "-c",
        "protocol.ext.allow=never",
        "clone",
        "--",
        url,
        target,
      ],
      {
        signal,
        timeout: 120_000,
        maxBuffer: 512 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_COUNT: "0",
          GIT_ASKPASS: "/bin/false",
        },
      },
      (error) =>
        error
          ? reject(
              new Error(
                "Clone failed. Check Git, public repository access, and the machine's network.",
              ),
            )
          : accept(),
    ),
  );
}
export function openWorkspaces(
  directory: string,
  machine?: ReturnType<typeof openMachineSettings>,
  clone = cloneRepository,
) {
  const db = new DatabaseSync(join(directory, "catalog.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, requestId TEXT UNIQUE NOT NULL)",
  );
  const columns = db
    .prepare("PRAGMA table_info(workspaces)")
    .all()
    .map((row) => row.name);
  for (const [name, type] of [
    ["repository", "TEXT"],
    ["error", "TEXT"],
    ["state", "TEXT NOT NULL DEFAULT 'ready'"],
    ["deleted", "INTEGER NOT NULL DEFAULT 0"],
    ["lastConfiguration", "TEXT"],
    ["isDefault", "INTEGER NOT NULL DEFAULT 0"],
  ])
    if (!columns.includes(name))
      db.exec(`ALTER TABLE workspaces ADD COLUMN ${name} ${type}`);
  db.exec("UPDATE workspaces SET state='interrupted' WHERE state='cloning'");
  const jobs = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  let pending: Promise<unknown> = Promise.resolve();
  const row = (id: string) =>
    db.prepare("SELECT * FROM workspaces WHERE id=?").get(id) as
      | Workspace
      | undefined;
  function get(id: string, includeDeleted = false) {
    const item = row(id);
    if (!item || (item.deleted && !includeDeleted))
      throw httpError(404, "Project not found.");
    return item;
  }
  function startClone(item: Workspace) {
    const controller = new AbortController();
    const staging = join(
      dirname(item.path),
      `.console-clone-${item.id}-${randomUUID()}`,
    );
    db.prepare(
      "UPDATE workspaces SET state='cloning', error=NULL WHERE id=?",
    ).run(item.id);
    const done = (async () => {
      let outcome = "ready";
      let error: string | null = null;
      try {
        await mkdir(dirname(item.path), { recursive: true });
        await clone(item.repository ?? "", staging, controller.signal);
        // A user-created target is never overwritten by a completed clone.
        if (
          await stat(item.path).then(
            () => true,
            () => false,
          )
        )
          throw new Error("Target exists");
        await rename(staging, item.path);
      } catch {
        outcome = controller.signal.aborted ? "interrupted" : "failed";
        error = controller.signal.aborted
          ? "Clone interrupted. Retry when the machine is available."
          : "Clone failed. Check Git, public repository access, available disk space, and destination permissions.";
      } finally {
        try {
          await rm(staging, { recursive: true, force: true });
        } catch {
          outcome = "failed";
          error =
            "Clone cleanup failed. Check destination permissions before retrying.";
        }
        jobs.delete(item.id);
        db.prepare("UPDATE workspaces SET state=?, error=? WHERE id=?").run(
          outcome,
          error,
          item.id,
        );
      }
    })();
    jobs.set(item.id, { controller, done });
  }
  const catalog = {
    async ensureDefault(): Promise<Workspace> {
      const existing = db
        .prepare("SELECT * FROM workspaces WHERE isDefault=1")
        .get() as Workspace | undefined;
      if (existing) return existing;
      const item = await catalog.create({
        name: "Default",
        path: join(`${directory}-projects`, "default"),
        createDirectory: true,
        requestId: "console:default-project",
      });
      db.prepare("UPDATE workspaces SET isDefault=1 WHERE id=?").run(item.id);
      return get(item.id);
    },
    list: (trash = false) =>
      db
        .prepare("SELECT * FROM workspaces WHERE deleted=? ORDER BY name")
        .all(trash ? 1 : 0) as Workspace[],
    get,
    create(input: {
      name: string;
      path?: string;
      repository?: string;
      requestId: string;
      createDirectory?: boolean;
    }) {
      const next = pending.then(async () => {
        const duplicate = db
          .prepare("SELECT * FROM workspaces WHERE requestId=?")
          .get(input.requestId) as Workspace | undefined;
        if (duplicate) return duplicate;
        if (!input.name.trim())
          throw httpError(400, "Project name is required.");
        let repository: URL | undefined;
        if (input.repository) {
          try {
            repository = new URL(input.repository);
          } catch {
            throw httpError(400, "Enter a public GitHub repository URL.");
          }
          if (
            repository.protocol !== "https:" ||
            repository.hostname !== "github.com" ||
            repository.username ||
            repository.password ||
            repository.search ||
            repository.hash ||
            !/^\/[\w.-]+\/[\w.-]+\/?$/.test(repository.pathname)
          )
            throw httpError(
              400,
              "Use https://github.com/owner/repository without credentials or extra paths.",
            );
        }
        const root = machine?.get().projectsDirectory;
        const repoName = repository?.pathname
          .split("/")
          .filter(Boolean)
          .at(-1)
          ?.replace(/\.git$/, "");
        const target =
          input.path ||
          (root
            ? join(
                root,
                repoName || input.name.trim().replace(/[^\w.-]+/g, "-"),
              )
            : "");
        if (!isAbsolute(target))
          throw httpError(
            400,
            "An absolute project path or machine projects directory is required.",
          );
        let path = resolve(target);
        const privatePath = await realpath(directory);
        if (
          path === privatePath ||
          path.startsWith(privatePath + sep) ||
          privatePath.startsWith(path + sep) ||
          path === dirname(path)
        )
          throw httpError(
            400,
            "Projects cannot overlap Console private storage.",
          );
        if (input.createDirectory || repository) {
          let ancestor = dirname(path);
          while (
            !(await stat(ancestor).then(
              () => true,
              () => false,
            ))
          )
            ancestor = dirname(ancestor);
          path = resolve(
            await realpath(ancestor),
            path.slice(ancestor.length).replace(/^\/+/, ""),
          );
          if (
            path === privatePath ||
            path.startsWith(privatePath + sep) ||
            privatePath.startsWith(path + sep)
          )
            throw httpError(
              400,
              "Projects cannot overlap Console private storage.",
            );
        }
        if (repository) {
          if (
            await stat(path).then(
              () => true,
              () => false,
            )
          )
            throw httpError(
              400,
              "Clone destination already exists; register it as an existing directory instead.",
            );
          // Canonicalize the closest existing ancestor before any creation.
          let ancestor = dirname(path);
          while (
            !(await stat(ancestor).then(
              () => true,
              () => false,
            ))
          )
            ancestor = dirname(ancestor);
          const canonical = await realpath(ancestor);
          path = resolve(
            canonical,
            path.slice(ancestor.length).replace(/^\/+/, ""),
          );
        } else {
          try {
            if (input.createDirectory)
              await mkdir(path, { recursive: true, mode: 0o700 });
            path = await realpath(path);
            if (!(await stat(path)).isDirectory()) throw new Error();
          } catch {
            throw httpError(
              400,
              "Project directory is unavailable. Select an existing directory or choose Create directory.",
            );
          }
        }
        if (
          path === privatePath ||
          path.startsWith(privatePath + sep) ||
          privatePath.startsWith(path + sep)
        )
          throw httpError(
            400,
            "Projects cannot overlap Console private storage.",
          );
        const existing = db
          .prepare("SELECT * FROM workspaces WHERE path=?")
          .get(path) as Workspace | undefined;
        if (existing) {
          if (existing.deleted)
            throw httpError(409, "This project is in Trash. Restore it first.");
          return existing;
        }
        const item = {
          id: randomUUID(),
          name: input.name.trim(),
          path,
          repository: repository?.href ?? null,
          state: repository ? "cloning" : "ready",
        };
        db.prepare(
          "INSERT INTO workspaces (id,name,path,requestId,repository,state) VALUES (?,?,?,?,?,?)",
        ).run(
          item.id,
          item.name,
          path,
          input.requestId,
          item.repository,
          item.state,
        );
        if (repository) startClone(get(item.id));
        return get(item.id);
      });
      pending = next.catch(() => {});
      return next;
    },
    rename(id: string, name: string) {
      get(id);
      db.prepare("UPDATE workspaces SET name=? WHERE id=?").run(name, id);
    },
    remember(id: string, config: AgentConfiguration) {
      get(id);
      db.prepare("UPDATE workspaces SET lastConfiguration=? WHERE id=?").run(
        JSON.stringify(config),
        id,
      );
    },
    retry(id: string) {
      const item = get(id);
      if (!item.repository || item.state === "ready" || jobs.has(id))
        throw httpError(409, "Project is not eligible for clone retry.");
      startClone(item);
      return get(id);
    },
    async trash(id: string) {
      if (get(id).isDefault)
        throw httpError(409, "The Default project cannot be deleted.");
      const job = jobs.get(id);
      job?.controller.abort();
      await job?.done;
      db.prepare("UPDATE workspaces SET deleted=1 WHERE id=?").run(id);
    },
    purge(id: string) {
      const item = get(id, true);
      if (!item.deleted)
        throw httpError(409, "Move the project to Trash first.");
      db.prepare("DELETE FROM workspaces WHERE id=? AND deleted=1").run(id);
    },
    restore(id: string) {
      get(id, true);
      db.prepare("UPDATE workspaces SET deleted=0 WHERE id=?").run(id);
    },
    async close() {
      await pending;
      for (const job of jobs.values()) job.controller.abort();
      await Promise.allSettled([...jobs.values()].map((job) => job.done));
      db.close();
    },
  };
  return catalog;
}
export function registerWorkspaces(
  app: FastifyInstance,
  workspaces: ReturnType<typeof openWorkspaces>,
  trash: (id: string) => Promise<void>,
) {
  const name = { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" };
  app.get("/workspaces", () => workspaces.list());
  app.get("/workspaces/trash", () => workspaces.list(true));
  app.post<{
    Body: {
      name: string;
      path?: string;
      repository?: string;
      requestId: string;
      createDirectory?: boolean;
    };
  }>(
    "/workspaces",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "requestId"],
          additionalProperties: false,
          properties: {
            name,
            path: { type: "string", maxLength: 2000 },
            repository: { type: "string", maxLength: 2000 },
            requestId: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              pattern: "^(?!console:).+",
            },
            createDirectory: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await workspaces.create(req.body)),
  );
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/workspaces/:id",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name },
        },
      },
    },
    (req) => {
      workspaces.rename(req.params.id, req.body.name.trim());
      return workspaces.get(req.params.id);
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/workspaces/:id",
    async (req, reply) => {
      await trash(req.params.id);
      return reply.code(204).send();
    },
  );
  app.post<{ Params: { id: string } }>("/workspaces/:id/restore", (req) => {
    workspaces.restore(req.params.id);
    return workspaces.get(req.params.id);
  });
  app.post<{ Params: { id: string } }>("/workspaces/:id/retry", (req) =>
    workspaces.retry(req.params.id),
  );
}

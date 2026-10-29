import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Models } from "@earendil-works/pi-ai";
import { openAgentState } from "./agent-extension.ts";
import { openConversation } from "./conversation.ts";
import type { openMachineSettings } from "./machine-settings.ts";
import { httpError } from "./providers.ts";
import { purgeConversationDatabase } from "./purge-conversation.ts";
import { defaultSandbox } from "./sandbox-policy.ts";
import { openWorkspaces } from "./workspaces.ts";

type Session = {
  id: string;
  name: string;
  createdAt: string;
  workspaceId?: string | null;
  deleted?: number;
};

export async function openSessions(
  models: Models,
  directory: string,
  machine?: ReturnType<typeof openMachineSettings>,
) {
  const db = new DatabaseSync(join(directory, "catalog.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, requestId TEXT UNIQUE)",
  );
  if (
    !db
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .some((column) => column.name === "workspaceId")
  )
    db.exec("ALTER TABLE sessions ADD COLUMN workspaceId TEXT");
  if (
    !db
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .some((column) => column.name === "deleted")
  )
    db.exec(
      "ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0",
    );
  const workspaces = openWorkspaces(directory, machine);
  const state = openAgentState(directory);
  try {
    // Register the original database in place. No transcript or credential files move.
    await stat(join(directory, "conversation.sqlite"));
    db.prepare(
      "INSERT OR IGNORE INTO sessions (id, name, createdAt, requestId) VALUES ('default', 'Original conversation', ?, NULL)",
    ).run(new Date().toISOString());
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      db.close();
      throw error;
    }
  }
  const defaultProject = await workspaces.ensureDefault();
  // Associate legacy sessions without moving their databases or changing saved grants.
  db.prepare(
    "UPDATE sessions SET workspaceId=? WHERE workspaceId IS NULL OR workspaceId=''",
  ).run(defaultProject.id);
  db.exec(
    "CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT OR IGNORE INTO counters SELECT 'session', COALESCE(MAX(rowid),0) FROM sessions",
  );
  const maintenance = new Set<string>();
  const opened = new Map<string, ReturnType<typeof openConversation>>();
  let pending: Promise<unknown> = Promise.resolve();

  function record(id: string, includeDeleted = false) {
    if (maintenance.has(id))
      throw httpError(409, "Session maintenance in progress.");
    const row = db
      .prepare(
        "SELECT id, name, createdAt, workspaceId, deleted FROM sessions WHERE id = ?",
      )
      .get(id);
    if (!row || (row.deleted && !includeDeleted))
      throw httpError(404, "Session not found.");
    if (row.workspaceId && !includeDeleted)
      workspaces.get(String(row.workspaceId));
    return row as Session;
  }
  function open(id: string, duringMaintenance = false) {
    if (maintenance.has(id) && !duringMaintenance)
      throw httpError(409, "Session maintenance in progress.");
    let promise = opened.get(id);
    if (!promise) {
      const path =
        id === "default" ? directory : join(directory, "sessions", id);
      promise = mkdir(path, { recursive: true, mode: 0o700 }).then(() =>
        openConversation(models, path, directory, state, id),
      );
      opened.set(id, promise);
      void promise.catch(() => opened.delete(id));
    }
    return promise;
  }
  return {
    workspaces,
    state,
    async list(trash = false) {
      const rows = db
        .prepare(
          "SELECT id, name, createdAt, workspaceId, deleted FROM sessions WHERE deleted=? ORDER BY createdAt, id",
        )
        .all(trash ? 1 : 0) as Session[];
      return Promise.all(
        rows
          .filter(
            (row) =>
              !row.workspaceId ||
              workspaces
                .list(trash)
                .some((workspace) => workspace.id === row.workspaceId) ||
              (trash &&
                workspaces
                  .list()
                  .some((workspace) => workspace.id === row.workspaceId)),
          )
          .map(async (row) => {
            try {
              return { ...(await (await open(row.id)).summary()), ...row };
            } catch {
              return { ...row, status: "unavailable" };
            }
          }),
      );
    },
    create(
      name: string,
      requestId: string,
      workspaceId?: string,
      access: "none" | "read" | "edit" | "project" | "setup" = "none",
    ) {
      const next = pending.then(async () => {
        const existing = db
          .prepare("SELECT id FROM sessions WHERE requestId = ?")
          .get(requestId);
        if (existing) return record(String(existing.id));
        const workspace = workspaces.get(workspaceId || defaultProject.id);
        if (workspace && workspace.state !== "ready")
          throw httpError(
            409,
            "Wait for the project clone to finish, or retry a failed clone.",
          );
        const number = db
          .prepare(
            "UPDATE counters SET value=value+1 WHERE name='session' RETURNING value",
          )
          .get()?.value;
        const row = {
          workspaceId: workspace.id,
          id: randomUUID(),
          name: name.trim() || `Conversation #${number}`,
          createdAt: new Date().toISOString(),
        };
        const runtime = await open(row.id);
        if (workspace)
          await runtime.configureSandbox({
            ...defaultSandbox(),
            workspace: workspace.path,
            enabled: access !== "none",
            commands: ["project", "setup"].includes(access),
            writePaths: ["edit", "project", "setup"].includes(access)
              ? [workspace.path]
              : [],
            network: access === "setup" ? "unrestricted" : "blocked",
          });
        const settings = machine?.get();
        let preferred = workspace?.lastConfiguration
          ? JSON.parse(workspace.lastConfiguration)
          : (settings?.defaultConfiguration ?? settings?.lastConfiguration);
        if (!preferred && machine) {
          const previous = db
            .prepare(
              "SELECT id FROM sessions WHERE deleted=0 ORDER BY CASE WHEN workspaceId=? THEN 0 ELSE 1 END, createdAt DESC LIMIT 20",
            )
            .all(workspaceId ?? null);
          for (const candidate of previous) {
            try {
              const saved = await (await open(String(candidate.id))).summary();
              if (
                saved.model &&
                models.getModel(saved.model.provider, saved.model.modelId) &&
                (await models.checkAuth(saved.model.provider))
              ) {
                preferred = {
                  provider: saved.model.provider,
                  model: saved.model.modelId,
                  thinkingLevel: saved.thinkingLevel,
                };
                machine.remember(preferred);
                break;
              }
            } catch {
              /* Damaged history cannot block a new session. */
            }
          }
        }
        if (
          preferred &&
          models.getModel(preferred.provider, preferred.model) &&
          (await models.checkAuth(preferred.provider))
        )
          await runtime.configure(preferred);
        db.prepare(
          "INSERT INTO sessions (id,name,createdAt,requestId,workspaceId) VALUES (?, ?, ?, ?, ?)",
        ).run(row.id, row.name, row.createdAt, requestId, row.workspaceId);
        return row;
      });
      pending = next.catch(() => {});
      return next;
    },
    async get(id: string, conversationId?: string) {
      const row = record(id);
      return {
        ...(await (
          await (await open(id)).conversation(conversationId)
        ).snapshot()),
        ...row,
      };
    },
    async conversation(id: string, conversationId?: string) {
      const row = record(id);
      const runtime = await (await open(id)).conversation(conversationId);
      return {
        ...runtime,
        configure: async (
          configuration: import("./conversation.ts").AgentConfiguration,
        ) => {
          const result = await runtime.configure(configuration);
          const chosen = {
            ...configuration,
            thinkingLevel: result.thinkingLevel,
          };
          machine?.remember(chosen);
          if (row.workspaceId) workspaces.remember(row.workspaceId, chosen);
          return result;
        },
        configureSandbox: async (
          policy: import("./sandbox-policy.ts").SandboxPolicy,
        ) => {
          if (
            row.workspaceId &&
            policy.workspace !== workspaces.get(row.workspaceId).path
          )
            throw httpError(
              400,
              "This session is bound to its project directory. Create a session in another project to change directories.",
            );
          return runtime.configureSandbox(policy);
        },
      };
    },
    async conversations(id: string) {
      record(id);
      return (await open(id)).conversations();
    },
    async createConversation(id: string, name: string, requestId: string) {
      record(id);
      return (await open(id)).createConversation(name, requestId);
    },
    async renameConversation(id: string, conversationId: string, name: string) {
      record(id);
      return (await open(id)).renameConversation(conversationId, name);
    },
    rename(id: string, name: string) {
      record(id);
      db.prepare("UPDATE sessions SET name = ? WHERE id = ?").run(name, id);
    },
    async trash(id: string) {
      const row = record(id);
      const state = await (await open(id))
        .summary()
        .catch(() => ({ status: "unavailable" }));
      if (!["idle", "unavailable"].includes(state.status))
        throw httpError(
          409,
          "Cancel or finish the session before deleting it.",
        );
      db.prepare("UPDATE sessions SET deleted=1 WHERE id=?").run(row.id);
    },
    restore(id: string) {
      const row = record(id, true);
      if (row.workspaceId) workspaces.get(row.workspaceId);
      db.prepare("UPDATE sessions SET deleted=0 WHERE id=?").run(id);
    },
    async trashWorkspace(id: string) {
      if (workspaces.get(id).isDefault)
        throw httpError(409, "The Default project cannot be deleted.");
      const rows = db
        .prepare("SELECT id FROM sessions WHERE workspaceId=? AND deleted=0")
        .all(id);
      for (const row of rows) {
        const state = await (await open(String(row.id)))
          .summary()
          .catch(() => ({ status: "unavailable" }));
        if (!["idle", "unavailable"].includes(state.status))
          throw httpError(
            409,
            "Cancel or finish project sessions before deleting the project.",
          );
      }
      await workspaces.trash(id);
    },
    async trashConversation(id: string, conversationId: string) {
      record(id);
      return (await open(id)).trashConversation(conversationId);
    },
    async restoreConversation(id: string, conversationId: string) {
      record(id);
      return (await open(id)).restoreConversation(conversationId);
    },
    async purge(id: string, conversationId?: string) {
      const row = record(id, true);
      if (!conversationId && !row.deleted)
        throw httpError(409, "Move the session to Trash first.");
      if (conversationId && row.deleted)
        throw httpError(
          409,
          "Restore the session to manage its conversations.",
        );
      maintenance.add(id);
      try {
        // Damaged databases can still be removed with their already-trashed session.
        let runtime: Awaited<ReturnType<typeof openConversation>> | undefined;
        try {
          runtime = await open(id, true);
        } catch (error) {
          if (conversationId) throw error;
        }
        await runtime?.preparePurge(conversationId);
        opened.delete(id);
        const path =
          id === "default" ? directory : join(directory, "sessions", id);
        if (conversationId)
          purgeConversationDatabase(
            join(path, "conversation.sqlite"),
            conversationId,
          );
        else {
          for (const suffix of ["", "-wal", "-shm"])
            await rm(join(path, `conversation.sqlite${suffix}`), {
              force: true,
            });
          if (id !== "default")
            await rm(path, { recursive: true, force: true });
          db.prepare("DELETE FROM sessions WHERE id=? AND deleted=1").run(id);
        }
      } finally {
        maintenance.delete(id);
      }
    },
    purgeWorkspace(id: string) {
      if (
        db
          .prepare("SELECT id FROM sessions WHERE workspaceId=? LIMIT 1")
          .get(id)
      )
        throw httpError(
          409,
          "Restore the project, permanently delete its sessions, then delete the project registration. Project files stay on disk.",
        );
      workspaces.purge(id);
    },
    async deletedConversations(id: string) {
      record(id);
      return (await open(id)).conversations(true);
    },
    async close() {
      await pending;
      const results = await Promise.allSettled(
        [...opened.values()].map(async (value) => (await value).close()),
      );
      await workspaces.close();
      state.close();
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

import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  AgentDoc,
  type ConversationId,
  createRegistry,
  type EntryId,
  Harness,
  type Conversation as PiConversation,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { httpError } from "../http/errors.ts";
import { SandboxDoc } from "../sandbox/policy.ts";
import { sandboxExtension } from "../sandbox/tools.ts";
import { agentConfiguration } from "./configuration.ts";
import { assertIdle, type Runtime } from "./context.ts";
import { agentExtension, type openAgentState } from "./coordination.ts";
import { ConversationInfo } from "./documents.ts";
import { conversationInput } from "./input.ts";
import { conversationView } from "./view.ts";
export async function openConversation(
  models: Models,
  directory: string,
  privateDirectory = directory,
  sharedState?: ReturnType<typeof openAgentState>,
  sessionId = directory,
) {
  const storage = await openNodeSqliteStorage(
    join(directory, "conversation.sqlite"),
  );
  const sandbox = sandboxExtension(privateDirectory);
  const registry = createRegistry();
  registry.install(sandbox.extension);
  const coordination = sharedState
    ? agentExtension(sharedState, sessionId)
    : undefined;
  if (coordination) registry.install(coordination);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      identity: {
        attribution: {
          name: "Console",
          url: "https://github.com/HYP3R00T/console",
        },
      },
    },
    context,
  );
  const main = await harness.root(context, {
    agent: {
      tools: coordination?.tools ?? [],
      instructions:
        "You are Console's assistant. Use available tools and report limitations accurately. Delegate only when asked.",
    },
  });
  // Serialize configure + submit, so concurrent requests cannot change each other's model.
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.catch(() => {});
    return next;
  }
  const runtime: Runtime = {
    models,
    storage,
    harness,
    registry,
    sandbox,
    coordination,
    privateDirectory,
    serialize,
  };
  function bind(root: PiConversation) {
    return {
      ...conversationView(runtime, root),
      ...agentConfiguration(runtime, root),
      ...conversationInput(runtime, root),
      fork(entryId: string, requestId: string) {
        return serialize(async () => {
          await assertIdle(runtime, root);
          const prior = [
            ...(await conversations()),
            ...(await conversations(true)),
          ].find((item) => item.requestId === requestId);
          if (prior?.deleted)
            throw httpError(409, "Restore the deleted fork first.");
          if (prior) return prior;
          if (
            !/^[1-9]\d*$/.test(entryId) ||
            !Number.isSafeInteger(Number(entryId))
          )
            throw httpError(400, "Invalid history entry.");
          const view = await root.context(context, {
            at: Number(entryId) as EntryId,
          });
          if (!view.entries.some((entry) => String(entry.id) === entryId))
            throw httpError(404, "History entry not found.");
          const policy = await harness.snapshot(SandboxDoc, root.id, context);
          const fork = await root.fork(
            Number(entryId) as EntryId,
            {
              ownership: { kind: "ownerless" },
              init: async (tx, id) => {
                Object.assign(await tx.doc(ConversationInfo, id), {
                  requestId,
                });
                if (policy) Object.assign(await tx.doc(SandboxDoc, id), policy);
              },
            },
            context,
          );
          return { ...(await bind(fork).summary()), name: `Fork #${fork.id}` };
        });
      },
      async close() {
        await pending;
        await harness.close(context);
      },
    };
  }
  async function conversations(trash = false) {
    const rows = await storage.scanConversations({}, 1000, undefined, context);
    if (rows.next) throw httpError(409, "Conversation list limit reached.");
    const items = await Promise.all(
      rows.items.map(async (row) => {
        const info = await harness.snapshot(ConversationInfo, row.id, context);
        const handle = await harness.conversation(row.id, context);
        if (!handle) throw httpError(404, "Conversation not found.");
        return {
          ...(await bind(handle).summary()),
          name:
            info?.name ||
            (row.id === main.id
              ? "Main"
              : `${row.owner ? "Subagent" : row.parent ? "Fork" : "Root"} #${row.id}`),
          parentId: row.owner
            ? String(row.owner.conversationId)
            : row.parent
              ? String(row.parent.conversationId)
              : undefined,
          isMain: row.id === main.id,
          kind: row.owner ? "subagent" : row.parent ? "fork" : "root",
          requestId: info?.requestId,
          deleted: Boolean(info?.deleted),
        };
      }),
    );
    return items.filter((item) => item.deleted === trash);
  }
  return {
    ...bind(main),
    async summary() {
      const state = await bind(main).summary();
      const inspection = await harness.inspect(context);
      return {
        ...state,
        status: inspection.tasks.length
          ? inspection.scheduling === "paused"
            ? "interrupted"
            : inspection.tasks.some((task) => task.state.kind === "blocked")
              ? "blocked"
              : "running"
          : "idle",
      };
    },
    conversations,
    preparePurge(id?: string) {
      return serialize(async () => {
        if ((await harness.inspect(context)).tasks.length)
          throw httpError(
            409,
            "Finish or cancel all session work before permanent deletion.",
          );
        if (id) {
          if (id === String(main.id))
            throw httpError(
              409,
              "Main owns the session. Permanently delete the session to erase Main.",
            );
          const row = (await conversations(true)).find(
            (item) => item.id === id,
          );
          if (!row)
            throw httpError(409, "Move the conversation to Trash first.");
          const record = await storage.conversation(
            Number(id) as ConversationId,
            context,
          );
          if (record?.owner)
            throw httpError(
              409,
              "Delegated history belongs to its owning task. Permanently delete the session to erase it.",
            );
          const all = [
            ...(await conversations()),
            ...(await conversations(true)),
          ];
          if (all.some((item) => item.parentId === id))
            throw httpError(
              409,
              "Permanently delete descendant conversations first; they depend on this history.",
            );
        }
        await harness.close(context);
      });
    },
    async conversation(id?: string) {
      if (!id) {
        if (
          !(await harness.snapshot(ConversationInfo, main.id, context))?.deleted
        )
          return bind(main);
        const first = (await conversations())[0];
        if (!first) throw httpError(404, "No active conversations.");
        const handle = await harness.conversation(
          Number(first.id) as ConversationId,
          context,
        );
        if (!handle) throw httpError(404, "Conversation not found.");
        return bind(handle);
      }
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
        throw httpError(404, "Conversation not found.");
      const handle = await harness.conversation(
        Number(id) as ConversationId,
        context,
      );
      if (
        !handle ||
        (await harness.snapshot(ConversationInfo, handle.id, context))?.deleted
      )
        throw httpError(404, "Conversation not found.");
      return bind(handle);
    },
    createConversation(name: string, requestId: string) {
      return serialize(async () => {
        const existing = [
          ...(await conversations()),
          ...(await conversations(true)),
        ].find((item) => item.requestId === requestId);
        if (existing?.deleted)
          throw httpError(
            409,
            "Restore the deleted conversation instead of creating it again.",
          );
        if (existing) return existing;
        const agent = await harness.snapshot(AgentDoc, main.id, context);
        const policy = await harness.snapshot(SandboxDoc, main.id, context);
        const current = await main.agent(context);
        const created = await harness.createConversation(
          {
            ownership: { kind: "ownerless" },
            agent: {
              extensions: current.extensions,
              model: agent?.model,
              thinkingLevel: agent?.thinkingLevel,
              instructions: agent?.instructions,
              cwd: agent?.cwd,
              tools: Array.isArray(agent?.tools)
                ? registry
                    .snapshot()
                    .tools()
                    .filter(
                      ({ tool }) =>
                        Array.isArray(agent.tools) &&
                        agent.tools.includes(tool.name),
                    )
                    .map(({ tool }) => tool)
                : [],
            },
            init: async (tx, id) => {
              Object.assign(await tx.doc(ConversationInfo, id), {
                name,
                requestId,
              });
              if (policy) Object.assign(await tx.doc(SandboxDoc, id), policy);
            },
          },
          context,
        );
        return {
          ...(await bind(created).summary()),
          name: name || `Root #${created.id}`,
        };
      });
    },
    async trashConversation(id: string) {
      return serialize(async () => {
        const visible = await conversations();
        if (visible.length < 2)
          throw httpError(
            409,
            "Delete the session to remove its last conversation.",
          );
        const item = visible.find((row) => row.id === id);
        if (!item) throw httpError(404, "Conversation not found.");
        if (item.status !== "idle")
          throw httpError(
            409,
            "Cancel or finish this conversation before deleting it.",
          );
        const handle = await harness.conversation(
          Number(id) as ConversationId,
          context,
        );
        if (!handle) throw httpError(404, "Conversation not found.");
        await handle.commit(async (tx) => {
          (await tx.doc(ConversationInfo, handle.id)).deleted = true;
        }, context);
      });
    },
    async restoreConversation(id: string) {
      if (!(await conversations(true)).some((item) => item.id === id))
        throw httpError(404, "Deleted conversation not found.");
      const handle = await harness.conversation(
        Number(id) as ConversationId,
        context,
      );
      if (!handle) throw httpError(404, "Conversation not found.");
      await handle.commit(async (tx) => {
        (await tx.doc(ConversationInfo, handle.id)).deleted = false;
      }, context);
    },
    async renameConversation(id: string, name: string) {
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
        throw httpError(404, "Conversation not found.");
      const handle = await harness.conversation(
        Number(id) as ConversationId,
        context,
      );
      if (!handle) throw httpError(404, "Conversation not found.");
      await handle.commit(async (tx) => {
        (await tx.doc(ConversationInfo, handle.id)).name = name;
      }, context);
    },
  };
}

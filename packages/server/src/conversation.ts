import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type {
  Message,
  Models,
  ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai/models";
import { estimateContextTokens } from "@earendil-works/pi-ai/utils/estimate";
import {
  AgentDoc,
  CompactionTask,
  type ConversationId,
  configure,
  createRegistry,
  DEFAULT_COMPACTION_POLICY,
  defineDoc,
  type EntryId,
  Harness,
  InboxDoc,
  LiveDoc,
  type Conversation as PiConversation,
  ResetEntry,
  type SubmissionId,
  UsageDoc,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { agentExtension, type openAgentState } from "./agent-extension.ts";
import { expandPrompt, type ProjectResources } from "./project-resources.ts";
import { httpError } from "./providers.ts";
import {
  defaultSandbox,
  SandboxDoc,
  type SandboxPolicy,
  validateSandbox,
} from "./sandbox-policy.ts";
import { runSandbox } from "./sandbox-runner.ts";
import { sandboxExtension } from "./sandbox-tools.ts";

const ConversationInfo = defineDoc<{
  name: string;
  requestId: string;
  deleted?: boolean;
}>({
  kind: "console.conversation",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ name: "", requestId: "" }),
  checkpointWhen: () => true,
});

// Atomic receipts keep a retried compact action from starting a second paid summary.
const CompactionReceipts = defineDoc<{ requests: Record<string, string> }>({
  kind: "console.compactions",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ requests: {} }),
  checkpointWhen: () => true,
});

function text(message: Message) {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}

function reasoning(message: Message, streaming = false) {
  if (message.role !== "assistant") return [];
  return message.content.flatMap((block, index) =>
    block.type === "thinking" && !block.redacted
      ? [
          {
            id: `thinking-${index}`,
            text: block.thinking,
            streaming: streaming && index === message.content.length - 1,
          },
        ]
      : [],
  );
}

export type AgentConfiguration = {
  provider: string;
  model: string;
  thinkingLevel?: ModelThinkingLevel;
};

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
  function bind(root: PiConversation) {
    async function history(before?: string) {
      if (
        before !== undefined &&
        (!/^[1-9][0-9]*$/.test(before) || !Number.isSafeInteger(Number(before)))
      )
        throw httpError(400, "Invalid history cursor.");
      const entries = await root.entries(
        {
          order: "descending",
          ...(before ? { maxEntryId: (Number(before) - 1) as EntryId } : {}),
        },
        50,
        undefined,
        context,
      );
      return {
        hasOlder: Boolean(entries.next),
        olderCursor: entries.next
          ? String(entries.items.at(-1)?.id)
          : undefined,
        messages: [...entries.items].reverse().flatMap((entry) =>
          (entry.model ?? [])
            .filter(
              (message) =>
                message.role === "user" ||
                message.role === "assistant" ||
                message.role === "toolResult",
            )
            .map((message, index) => ({
              id: `${entry.id}-${index}`,
              entryId: String(entry.id),
              kind: entry.kind,
              role: message.role,
              toolName:
                message.role === "toolResult" ? message.toolName : undefined,
              text: text(message),
              reasoning: reasoning(message),
              toolCalls:
                message.role === "assistant"
                  ? message.content.flatMap((block) =>
                      block.type === "toolCall"
                        ? [
                            {
                              id: block.id,
                              name: block.name,
                              arguments: block.arguments,
                            },
                          ]
                        : [],
                    )
                  : [],
            })),
        ),
      };
    }

    async function offered(policy: SandboxPolicy) {
      const record = await storage.conversation(root.id, context);
      const selected = new Set(
        (await root.agent(context)).extensions.map(
          (extension) => extension.name,
        ),
      );
      const permitted = [
        ...sandbox.tools(policy),
        ...(coordination?.tools ?? []).filter(
          (tool) => !record?.owner || tool.name !== "subagent",
        ),
      ];
      return registry
        .snapshot()
        .tools()
        .filter(
          ({ extension, tool }) =>
            selected.has(extension.name) &&
            permitted.some((candidate) => candidate.name === tool.name),
        )
        .map(({ tool }) => tool);
    }
    async function summary() {
      const agent = await harness.snapshot(AgentDoc, root.id, context);
      const inspection = await harness.inspect(context);
      const policy = await harness.snapshot(SandboxDoc, root.id, context);
      const tasks = inspection.tasks.filter(
        (task) => task.record.conversationId === root.id,
      );
      const model = agent?.model
        ? models.getModel(agent.model.provider, agent.model.modelId)
        : undefined;
      return {
        id: String(root.id),
        workspace: policy?.workspace || undefined,
        enabledTools: (await root.agent(context)).tools.map(
          (tool) => tool.name,
        ),
        model: agent?.model,
        thinkingLevel: model
          ? clampThinkingLevel(model, agent?.thinkingLevel ?? "off")
          : (agent?.thinkingLevel ?? "off"),
        status: tasks.length
          ? inspection.scheduling === "paused"
            ? "interrupted"
            : tasks.some((task) => task.state.kind === "blocked")
              ? "blocked"
              : "running"
          : "idle",
      };
    }
    async function assertIdle() {
      if (
        (await harness.inspect(context)).tasks.some(
          (task) => task.record.conversationId === root.id,
        )
      )
        throw httpError(
          409,
          "Cancel or finish the current work before changing settings or sending another message.",
        );
    }
    return {
      summary,
      async resources() {
        const policy = await validateSandbox(
          (await harness.snapshot(SandboxDoc, root.id, context)) ??
            defaultSandbox(),
          privateDirectory,
        );
        if (!policy.enabled)
          return { enabled: false, instructions: [], skills: [], prompts: [] };
        return {
          enabled: true,
          ...(JSON.parse(
            await runSandbox(
              policy,
              { operation: "resources" },
              privateDirectory,
            ),
          ) as ProjectResources),
        };
      },
      async inspect() {
        const agent = await root.agent(context);
        const active = new Set(agent.tools.map((item) => item.name));
        const policy =
          (await harness.snapshot(SandboxDoc, root.id, context)) ??
          defaultSandbox();
        const permitted = new Set(
          (await offered(policy)).map((item) => item.name),
        );
        const inspection = await harness.inspect(context);
        return {
          tools: registry
            .snapshot()
            .tools()
            .map(({ extension, tool }) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              replay: tool.replay ?? "interrupt",
              extension: extension.name,
              enabled: active.has(tool.name),
              permitted: permitted.has(tool.name),
            })),
          extensions: registry
            .snapshot()
            .installed()
            .map((item) => ({
              name: item.name,
              enabled: agent.extensions.some(
                (selected) => selected.name === item.name,
              ),
              tools: item.tools?.map((tool) => tool.name) ?? [],
              sections: item.sections?.length ?? 0,
              hooks: item.hooks?.length ?? 0,
            })),
          instructions: agent.instructions ?? "",
          tasks: inspection.tasks
            .filter((task) => task.record.conversationId === root.id)
            .map((task) => ({
              id: String(task.record.id),
              name: task.record.kind,
              state: task.state.kind,
            })),
          taskGraph: inspection.tasks.map((task) => ({
            id: String(task.record.id),
            name: task.record.kind,
            conversationId: String(task.record.conversationId),
            owner: task.record.owner ? String(task.record.owner) : undefined,
            background: task.record.background,
            abortRequested: task.record.abortRequested,
            state: task.state.kind,
            waitingOn:
              task.state.kind === "waiting" ? task.state.on.map(String) : [],
            wakeAt:
              task.state.kind === "sleeping" ? task.state.until : undefined,
            blockedReason:
              task.state.kind === "blocked" ? task.state.reason : undefined,
          })),
          scheduling: inspection.scheduling,
        };
      },
      selectExtension(name: string, enabled: boolean) {
        return serialize(async () => {
          await assertIdle();
          const extension = registry.snapshot().extension(name);
          if (!extension)
            throw httpError(404, "Extension is not installed on this machine.");
          const agent = await root.agent(context);
          const selected = new Set(agent.extensions.map((item) => item.name));
          if (enabled) selected.add(name);
          else selected.delete(name);
          const policy =
            (await harness.snapshot(SandboxDoc, root.id, context)) ??
            defaultSandbox();
          const record = await storage.conversation(root.id, context);
          const permitted = [
            ...sandbox.tools(policy),
            ...(coordination?.tools ?? []).filter(
              (tool) => !record?.owner || tool.name !== "subagent",
            ),
          ];
          const current = new Set(agent.tools.map((tool) => tool.name));
          await root.configure(
            {
              extensions: registry
                .snapshot()
                .installed()
                .filter((item) => selected.has(item.name)),
              tools: registry
                .snapshot()
                .tools()
                .filter(
                  ({ extension: owner, tool }) =>
                    selected.has(owner.name) &&
                    permitted.some(
                      (candidate) => candidate.name === tool.name,
                    ) &&
                    (current.has(tool.name) ||
                      (enabled && owner.name === name)),
                )
                .map(({ tool }) => tool),
            },
            context,
          );
        });
      },
      manage(input: { tools: string[]; instructions?: string }) {
        return serialize(async () => {
          await assertIdle();
          const policy =
            (await harness.snapshot(SandboxDoc, root.id, context)) ??
            defaultSandbox();
          const allowed = await offered(policy);
          if (
            input.tools.some(
              (name) => !allowed.some((tool) => tool.name === name),
            )
          )
            throw httpError(
              400,
              "Enable the required sandbox grants before selecting those tools.",
            );
          await root.configure(
            {
              tools: allowed.filter((tool) => input.tools.includes(tool.name)),
              ...(input.instructions === undefined
                ? (await root.agent(context)).instructions ===
                  "You are Console's assistant. No filesystem or command tools are enabled. Be clear about what you cannot inspect or execute."
                  ? {
                      instructions:
                        "You are Console's assistant. Use available tools and report limitations accurately. Delegate only when asked.",
                    }
                  : {}
                : { instructions: input.instructions }),
            },
            context,
          );
        });
      },
      fork(entryId: string, requestId: string) {
        return serialize(async () => {
          await assertIdle();
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
      configureSandbox(input: SandboxPolicy) {
        return serialize(async () => {
          await assertIdle();
          const policy = await validateSandbox(input, privateDirectory);
          if (policy.enabled) {
            try {
              await runSandbox(
                policy,
                { operation: "check" },
                privateDirectory,
              );
            } catch {
              throw httpError(
                400,
                "Sandbox could not be applied. Check nono/kernel support and path grants; the previous policy is unchanged.",
              );
            }
          }
          const tools = await offered(policy);
          const current = await root.agent(context);
          await root.commit(async (tx) => {
            Object.assign(await tx.doc(SandboxDoc, root.id), policy);
            await configure(tx, root.id, {
              tools,
              cwd: policy.enabled ? policy.workspace : null,
              instructions:
                current.instructions ===
                "You are Console's assistant. No filesystem or command tools are enabled. Be clear about what you cannot inspect or execute."
                  ? "You are Console's assistant. Use available tools and accurately report what you inspected or changed. Delegate only when asked."
                  : current.instructions,
            });
          }, context);
          return policy;
        });
      },
      configure(input: AgentConfiguration) {
        return serialize(async () => {
          await assertIdle();
          const model = models.getModel(input.provider, input.model);
          if (!model) throw httpError(400, "Unknown model.");
          if (!(await models.checkAuth(input.provider)))
            throw httpError(
              400,
              "Connect this provider before selecting its model.",
            );
          const current = await harness.snapshot(AgentDoc, root.id, context);
          const thinkingLevel =
            input.thinkingLevel ??
            clampThinkingLevel(model, current?.thinkingLevel ?? "off");
          if (!getSupportedThinkingLevels(model).includes(thinkingLevel))
            throw httpError(
              400,
              "This model does not support the selected thinking level.",
            );
          await root.configure(
            {
              model: { provider: input.provider, modelId: input.model },
              thinkingLevel,
            },
            context,
          );
          return summary();
        });
      },
      history,
      async snapshot() {
        const page = await history();
        const live = await harness.snapshot(LiveDoc, root.id, context);
        const inbox = await harness.snapshot(InboxDoc, root.id, context);
        const usage = await harness.snapshot(UsageDoc, root.id, context);
        const view = await root.context(context);
        const agent = await root.agent(context);
        const model = agent.model
          ? models.getModel(agent.model.provider, agent.model.modelId)
          : undefined;
        const last = (
          await storage.scanSubmissions(
            { conversationId: root.id, order: "descending" },
            1,
            undefined,
            context,
          )
        ).items[0];
        const state = await summary();
        const partial = live?.generation?.message as Message | undefined;
        return {
          ...state,
          sandbox:
            (await harness.snapshot(SandboxDoc, root.id, context)) ??
            defaultSandbox(),
          ...page,
          queue: (inbox?.items ?? [])
            .filter((item) => item.mode !== "write")
            .map((item) => ({
              id: String(item.id),
              mode: item.mode,
              text:
                "content" in item && typeof item.content === "string"
                  ? item.content
                  : "",
            })),
          usage: usage ?? { models: {}, tools: {} },
          contextUsage: {
            estimatedTokens: estimateContextTokens(view.messages).tokens,
            capacity: model?.contextWindow ?? 0,
            // These are Pi 1.4's defaults; Console does not override Harness settings.
            reserveTokens: DEFAULT_COMPACTION_POLICY.reserveTokens,
            backgroundTokens: DEFAULT_COMPACTION_POLICY.backgroundTokens,
          },
          compactions: (live?.compactions ?? []).map((item) => ({
            id: String(item.taskId),
            reason: item.reason,
            blocking: item.blocking,
            attempt: item.attempt,
            retryAt: item.retry?.at,
          })),
          // Provider exception text can contain secrets. Expose a safe status only.
          compactionFailed: Boolean(live?.compactionFailure),
          liveTools: [...(live?.tools ?? []), ...(live?.nestedTools ?? [])].map(
            (item) => ({
              id: item.callId,
              name: item.name,
              status: item.status,
              output: item.output,
            }),
          ),
          partial: partial ? text(partial) : "",
          partialReasoning: partial
            ? reasoning(partial, state.status === "running")
            : [],
          conversationId: String(root.id),
          partialId: live?.generation?.message
            ? `${live.generation.message.timestamp}-${live.generation.attempt}`
            : undefined,
          outcome: last?.status === "unanswered" ? last.reason : last?.status,
        };
      },
      submit(input: {
        text: string;
        requestId: string;
        whenBusy?: "reject" | "steer" | "followUp";
      }) {
        return serialize(async () => {
          const duplicate = await storage.submissionByRequest(
            root.id,
            input.requestId,
            context,
          );
          if (duplicate) return { id: String(duplicate.id) };
          if (!input.text.trim())
            throw httpError(400, "Message must not be blank.");
          if (!input.whenBusy || input.whenBusy === "reject")
            await assertIdle();
          const inspection = await harness.inspect(context);
          if (inspection.scheduling === "paused" && inspection.tasks.length)
            throw httpError(
              409,
              "Resume or cancel interrupted work in this session before submitting new work.",
            );
          const agent = await summary();
          if (
            !agent.model ||
            !models.getModel(agent.model.provider, agent.model.modelId)
          )
            throw httpError(400, "Choose a model in session settings first.");
          if (!(await models.checkAuth(agent.model.provider)))
            throw httpError(400, "Configure this provider first.");
          await root.configure({ thinkingLevel: agent.thinkingLevel }, context);
          let content = input.text;
          const command =
            /^\/(skill|prompt):([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(
              content,
            );
          if (command) {
            const policy = await validateSandbox(
              (await harness.snapshot(SandboxDoc, root.id, context)) ??
                defaultSandbox(),
              privateDirectory,
            );
            if (!policy.enabled)
              throw httpError(
                400,
                "Enable a project workspace before using project resources.",
              );
            const kind = command[1] as "skill" | "prompt";
            let resource: { path: string; content: string };
            try {
              resource = JSON.parse(
                await runSandbox(
                  policy,
                  {
                    operation: "resources",
                    resourceKind: kind,
                    resourceName: command[2],
                  },
                  privateDirectory,
                ),
              );
            } catch {
              throw httpError(
                400,
                "Project resource could not be loaded. Reload the resources and check its name and permissions.",
              );
            }
            try {
              content =
                kind === "prompt"
                  ? expandPrompt(resource.content, command[3] ?? "")
                  : `Use the following project skill from ${resource.path}. Supporting file paths are relative to its directory. Stay within the saved permissions.\n\n${resource.content}\n\nUser request: ${command[3] ?? ""}`;
            } catch {
              throw httpError(
                400,
                "Template arguments contain invalid quoting.",
              );
            }
            if (!content.trim())
              throw httpError(400, "Expanded project prompt is blank.");
            if (content.length > 64000)
              throw httpError(
                400,
                "Expanded project prompt exceeds 64,000 characters.",
              );
          }
          const submission = await root.submit(
            {
              type: "input",
              content,
              requestId: input.requestId,
              whenBusy: input.whenBusy ?? "reject",
            },
            context,
          );
          return { id: String(submission.id) };
        });
      },
      withdraw(id: string) {
        return serialize(async () => {
          if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
            throw httpError(400, "Invalid submission ID.");
          const record = await storage.submission(
            Number(id) as SubmissionId,
            context,
          );
          if (
            !record ||
            record.conversationId !== root.id ||
            record.type !== "input"
          )
            throw httpError(404, "Submission not found in this conversation.");
          const submission = await harness.submission(record.id, context);
          if (!submission) throw httpError(404, "Submission not found.");
          const result = await submission.abort(context);
          if (result === "already_placed")
            throw httpError(
              409,
              "This message is already part of the run; stop the run to cancel it.",
            );
        });
      },
      compact(input: { requestId: string; instructions?: string }) {
        return serialize(async () => {
          const receipts = await harness.snapshot(
            CompactionReceipts,
            root.id,
            context,
          );
          const receiptKey = `request:${input.requestId}`;
          if (receipts?.requests[receiptKey])
            return { id: receipts.requests[receiptKey] };
          await assertIdle();
          const inspection = await harness.inspect(context);
          if (inspection.scheduling === "paused" && inspection.tasks.length)
            throw httpError(
              409,
              "Resume or cancel interrupted work before compacting.",
            );
          const agent = await root.agent(context);
          if (!agent.model || !(await models.checkAuth(agent.model.provider)))
            throw httpError(
              400,
              "Connect a provider and choose a model before compacting.",
            );
          const id = await root.commit(async (tx) => {
            const saved = await tx.doc(CompactionReceipts, root.id);
            const task = await tx.createTask(
              CompactionTask,
              {
                reason: "manual" as const,
                ...(input.instructions
                  ? { instructions: input.instructions }
                  : {}),
              },
              { ownership: { kind: "conversation" }, conversationId: root.id },
            );
            const live = await tx.doc(LiveDoc, root.id);
            live.compactions ??= [];
            live.compactions.push({
              taskId: task,
              reason: "manual",
              blocking: false,
              attempt: 1,
            });
            saved.requests[receiptKey] = String(task);
            return String(task);
          }, context);
          harness.resume();
          return { id };
        });
      },
      reset(input: { requestId: string; handoff?: string }) {
        return serialize(async () => {
          const duplicate = await storage.submissionByRequest(
            root.id,
            input.requestId,
            context,
          );
          if (duplicate) return { id: String(duplicate.id) };
          await assertIdle();
          const inspection = await harness.inspect(context);
          if (inspection.scheduling === "paused" && inspection.tasks.length)
            throw httpError(
              409,
              "Resume or cancel interrupted work before resetting context.",
            );
          const submission = await root.submit(
            {
              type: "write",
              requestId: input.requestId,
              entry: {
                kind: ResetEntry.kind,
                head: "self",
                ...(input.handoff
                  ? {
                      model: [
                        {
                          role: "user",
                          content: input.handoff,
                          timestamp: Date.now(),
                        },
                      ],
                    }
                  : {}),
              },
            },
            context,
          );
          return { id: String(submission.id) };
        });
      },
      cancel: () => serialize(() => root.abort(context)),
      resume: () =>
        serialize(async () => {
          const agent = await harness.snapshot(AgentDoc, root.id, context);
          if (!agent?.model || !(await models.checkAuth(agent.model.provider)))
            throw httpError(
              400,
              "Configure the conversation's provider before resuming.",
            );
          harness.resume();
        }),
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

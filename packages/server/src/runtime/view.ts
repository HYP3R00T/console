import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import { clampThinkingLevel } from "@earendil-works/pi-ai/models";
import { estimateContextTokens } from "@earendil-works/pi-ai/utils/estimate";
import {
  AgentDoc,
  DEFAULT_COMPACTION_POLICY,
  type EntryId,
  InboxDoc,
  LiveDoc,
  type Conversation as PiConversation,
  UsageDoc,
} from "@earendil-works/pi-durable";
import { httpError } from "../http/errors.ts";
import {
  defaultSandbox,
  SandboxDoc,
  type SandboxPolicy,
  validateSandbox,
} from "../sandbox/policy.ts";
import type { ProjectResources } from "../sandbox/resources.ts";
import { runSandbox } from "../sandbox/runner.ts";
import type { Runtime } from "./context.ts";
import { PlanDoc } from "./plan.ts";
import { offeredTools } from "./tools.ts";

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

export async function conversationSummary(
  runtime: Runtime,
  root: PiConversation,
) {
  const { harness, models } = runtime;
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
    enabledTools: (await root.agent(context)).tools.map((tool) => tool.name),
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

export function conversationView(runtime: Runtime, root: PiConversation) {
  const { harness, models, storage, privateDirectory, registry } = runtime;
  const summary = () => conversationSummary(runtime, root);
  const offered = (policy: SandboxPolicy) =>
    offeredTools(runtime, root, policy);
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
      olderCursor: entries.next ? String(entries.items.at(-1)?.id) : undefined,
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
            toolCallId:
              message.role === "toolResult" ? message.toolCallId : undefined,
            isError:
              message.role === "toolResult" ? message.isError : undefined,
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

  return {
    summary,
    history,
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
          wakeAt: task.state.kind === "sleeping" ? task.state.until : undefined,
          blockedReason:
            task.state.kind === "blocked" ? task.state.reason : undefined,
        })),
        scheduling: inspection.scheduling,
      };
    },
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
        plan: await harness.snapshot(PlanDoc, root.id, context),
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
  };
}

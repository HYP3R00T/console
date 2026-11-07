import { randomUUID } from "node:crypto";
import type { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  defineExtension,
  defineTool,
  InboxDoc,
  LiveDoc,
  type TaskId,
  type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import {
  AgentReporter,
  admitAgentMessage,
  agentControlExtensionName,
  createPersistentAgent,
  PersistentAgents,
} from "./persistent-agents.ts";

const result = (value: unknown) => ({
  output: [{ type: "text" as const, text: JSON.stringify(value) }],
});
async function ownedAgent(
  api: ToolExecutionApi,
  id: string,
  context: typeof BACKGROUND_CONTEXT,
) {
  const registry = await api.snapshot(
    PersistentAgents,
    api.conversationId,
    context,
  );
  const agent = registry?.agents.find((item) => item.id === id);
  if (!agent) throw new Error("Agent not found in this conversation.");
  const child = await api.conversation(agent.conversationId, context);
  if (!child) throw new Error("Agent conversation is unavailable.");
  return { agent, child };
}

export const backgroundAgent = defineTool({
  name: "background_agent",
  description:
    "Create a persistent named agent, list agents, send a request, or wait for a previously sent request. Agents keep separate context and cannot create agents. Send returns a taskId immediately; wait takes that taskId. Default delivery adds findings to your next context without starting a new run. Ordinary Stop leaves background agents running.",
  callers: ["model"],
  replay: "safe",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: { enum: ["create", "list", "send", "wait"] },
      name: { type: "string", minLength: 1, maxLength: 100 },
      agentId: { type: "string", format: "uuid" },
      content: { type: "string", minLength: 1, maxLength: 32000 },
      whenBusy: { enum: ["steer", "followUp"] },
      delivery: { enum: ["display", "context", "followUp"] },
      taskId: { type: "integer", minimum: 1 },
    },
  } as const,
  async execute(input, api, context) {
    const args = input as {
      action: "create" | "list" | "send" | "wait";
      name?: string;
      agentId?: string;
      content?: string;
      whenBusy?: "steer" | "followUp";
      delivery?: "display" | "context" | "followUp";
      taskId?: number;
    };
    if (args.action === "create") {
      const name = args.name;
      if (!name?.trim()) throw new Error("Provide an agent name.");
      const id = await api.memo("agentId", randomUUID(), context);
      const agent = await api.commit(
        (tx) => createPersistentAgent(tx, api.conversationId, id, name),
        context,
      );
      return result(agent);
    }
    if (args.action === "list") {
      const state = await api.snapshot(
        PersistentAgents,
        api.conversationId,
        context,
      );
      const agents = await Promise.all(
        (state?.agents ?? []).map(async (agent) => {
          const live = await api.snapshot(
            LiveDoc,
            agent.conversationId,
            context,
          );
          const inbox = await api.snapshot(
            InboxDoc,
            agent.conversationId,
            context,
          );
          return {
            id: agent.id,
            name: agent.name,
            busy: !!live?.run,
            queued: inbox?.items.length ?? 0,
          };
        }),
      );
      return result({ agents });
    }
    if (args.action === "wait") {
      if (!args.taskId) throw new Error("Provide the taskId returned by send.");
      const id = args.taskId as TaskId;
      const task = await api.getTask(id, context);
      if (
        task?.conversationId !== api.conversationId ||
        task.kind !== AgentReporter.definition.name
      )
        throw new Error("Agent request not found in this conversation.");
      const settled = await api.waitForTask(id, context);
      return result({
        taskId: id,
        status: settled.state.outcome.status,
        note: "Delivered findings appear in the parent context when context or followUp delivery was selected.",
      });
    }
    const content = args.content;
    if (!args.agentId || !content?.trim())
      throw new Error("Provide agentId and content.");
    const { agent, child } = await ownedAgent(api, args.agentId, context);
    const id = await api.commit(
      (tx) =>
        admitAgentMessage(
          tx,
          api.conversationId,
          agent,
          child,
          content,
          `tool:${api.taskId}`,
          args.whenBusy ?? "followUp",
          args.delivery ?? "context",
        ),
      context,
    );
    return result({ agentId: agent.id, taskId: id });
  },
});

export const stopBackgroundAgent = defineTool({
  name: "stop_background_agent",
  description:
    "Stop a named agent's active and queued requests without deleting its conversation. This action is not replayed after interruption.",
  callers: ["model"],
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["agentId"],
    properties: { agentId: { type: "string", format: "uuid" } },
  } as const,
  async execute(input, api, context) {
    const args = input as { agentId: string };
    const { child } = await ownedAgent(api, args.agentId, context);
    await child.abort(context, { background: true });
    return result({ stopped: true });
  },
});

export const AgentControlExtension = defineExtension({
  name: agentControlExtensionName,
  tools: [backgroundAgent, stopBackgroundAgent],
});

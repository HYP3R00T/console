import type { Conversation } from "../api.ts";

export type ChatMessage = Conversation["messages"][number];
export type ToolActivity = {
  kind: "tool";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "done" | "error" | "interrupted" | "recorded";
  resultOnly?: boolean;
  entryId?: string;
  messageIds: string[];
};
export type ActivityStep =
  | ToolActivity
  | {
      kind: "reasoning" | "note";
      id: string;
      text: string;
      streaming?: boolean;
      messageIds: string[];
    };
export type TranscriptBlock =
  | { kind: "message" | "context"; id: string; message: ChatMessage }
  | {
      kind: "activity";
      id: string;
      steps: ActivityStep[];
      messageIds: string[];
    };

// A call and its result are one activity, joined by Pi's call ID, never by completion order/name.
// A page starting with an orphan result still preserves it until its call is loaded.
export function buildTranscript(
  messages: ChatMessage[],
  liveTools: Conversation["liveTools"] = [],
  running = false,
  partialReasoning: Conversation["partialReasoning"] = [],
) {
  const blocks: TranscriptBlock[] = [];
  let activity: Extract<TranscriptBlock, { kind: "activity" }> | undefined;
  const calls = new Map<string, ToolActivity>();
  const legacyResultIds = new Set(
    messages
      .filter((message) => message.role === "toolResult" && !message.toolCallId)
      .map((message) => message.id),
  );
  const callGroups = new Map<
    string,
    Extract<TranscriptBlock, { kind: "activity" }>
  >();
  function group(id: string) {
    if (!activity) {
      activity = {
        kind: "activity",
        id: `activity-${id}`,
        steps: [],
        messageIds: [],
      };
      blocks.push(activity);
    }
    if (!activity.messageIds.includes(id)) activity.messageIds.push(id);
    return activity;
  }
  for (const message of messages) {
    if (message.kind === "pi.compaction" || message.kind === "pi.reset") {
      activity = undefined;
      blocks.push({ kind: "context", id: message.id, message });
      continue;
    }
    if (message.role === "toolResult") {
      const owner = message.toolCallId
        ? calls.get(message.toolCallId)
        : undefined;
      const step = owner ?? {
        kind: "tool" as const,
        id: message.toolCallId ?? message.id,
        name: message.toolName ?? "Tool",
        messageIds: [],
        status: "done" as const,
        resultOnly: true,
      };
      step.output = message.text;
      step.status = toolFailed(message.text, message.isError)
        ? "error"
        : "done";
      step.entryId = message.entryId;
      step.messageIds.push(message.id);
      const target =
        (message.toolCallId ? callGroups.get(message.toolCallId) : undefined) ??
        group(message.id);
      if (!target.messageIds.includes(message.id))
        target.messageIds.push(message.id);
      if (!owner) target.steps.push(step);
      continue;
    }
    if (message.role === "assistant") {
      for (const part of message.reasoning ?? []) {
        if (part.text)
          group(message.id).steps.push({
            kind: "reasoning",
            id: `${message.id}-${part.id}`,
            text: part.text,
            messageIds: [message.id],
          });
      }
      if (message.toolCalls?.length) {
        const target = group(message.id);
        if (message.text)
          target.steps.push({
            kind: "note",
            id: `${message.id}-note`,
            text: message.text,
            messageIds: [message.id],
          });
        for (const call of message.toolCalls) {
          const step: ToolActivity = {
            kind: "tool",
            id: call.id,
            name: call.name,
            arguments: call.arguments,
            status: "interrupted",
            entryId: message.entryId,
            messageIds: [message.id],
          };
          target.steps.push(step);
          calls.set(call.id, step);
          callGroups.set(call.id, target);
        }
        continue;
      }
    }
    if (message.text) {
      activity = undefined;
      blocks.push({ kind: "message", id: message.id, message });
    }
  }
  for (const part of partialReasoning) {
    if (part.text)
      group("live-reasoning").steps.push({
        kind: "reasoning",
        id: `live-${part.id}`,
        text: part.text,
        streaming: part.streaming,
        messageIds: [],
      });
  }
  for (const tool of liveTools) {
    // Completed slots can outlive their saved result until the round ends; don't render them twice.
    const known =
      calls.get(tool.id) ??
      blocks
        .flatMap((block) => (block.kind === "activity" ? block.steps : []))
        .find(
          (step): step is ToolActivity =>
            step.kind === "tool" && step.id === tool.id,
        );
    if (known?.status === "done" || known?.status === "error") continue;
    const step: ToolActivity = known ?? {
      kind: "tool",
      id: tool.id,
      name: tool.name,
      messageIds: [],
      status: "pending",
    };
    step.status =
      tool.status === "done"
        ? "done"
        : !running
          ? "interrupted"
          : tool.status === "running"
            ? "running"
            : "pending";
    if (tool.output !== undefined) step.output = tool.output;
    if (!known) group(`live-${tool.id}`).steps.push(step);
  }
  // Older servers omitted result call IDs. Keep their outputs separate rather than guessing
  // which parallel call produced them, and don't mislabel an existing result as lost work.
  for (const block of blocks) {
    if (block.kind !== "activity") continue;
    const legacyOutputs = block.steps.some(
      (step) =>
        step.kind === "tool" &&
        step.resultOnly &&
        legacyResultIds.has(step.messageIds[0]),
    );
    if (legacyOutputs)
      for (const step of block.steps) {
        if (
          step.kind === "tool" &&
          step.status === "interrupted" &&
          !step.resultOnly
        )
          step.status = "recorded";
      }
  }
  return blocks;
}

export function parsePlan(text: string): Conversation["plan"] | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== "object" ||
      !("title" in value) ||
      typeof value.title !== "string" ||
      !("steps" in value) ||
      !Array.isArray(value.steps)
    )
      return undefined;
    if (
      !value.steps.every(
        (step: unknown) =>
          step &&
          typeof step === "object" &&
          "step" in step &&
          typeof step.step === "string" &&
          "status" in step &&
          ["pending", "in_progress", "completed"].includes(String(step.status)),
      )
    )
      return undefined;
    return {
      title: value.title,
      steps: value.steps,
      sourceEntryId:
        "sourceEntryId" in value ? String(value.sourceEntryId) : "",
    };
  } catch {
    return undefined;
  }
}

function toolFailed(output: string, isError?: boolean) {
  if (isError) return true;
  try {
    const result: unknown = JSON.parse(output);
    return (
      typeof result === "object" &&
      result !== null &&
      "exitCode" in result &&
      typeof result.exitCode === "number" &&
      result.exitCode !== 0
    );
  } catch {
    return false;
  }
}

export function toolTitle(step: ToolActivity) {
  const args = step.arguments;
  const subject =
    typeof args?.command === "string"
      ? args.command
      : typeof args?.path === "string"
        ? args.path
        : typeof args?.url === "string"
          ? args.url
          : "";
  const verb =
    step.name === "bash"
      ? "Command"
      : step.name === "read"
        ? "Read"
        : step.name === "list_directory"
          ? "List"
          : step.name === "write"
            ? "Write"
            : step.name === "edit"
              ? "Edit"
              : step.name === "update_plan"
                ? "Plan"
                : step.name.replaceAll("_", " ");
  return `${verb}${subject ? ` · ${subject}` : ""}`;
}

export function toolOutput(text: string) {
  try {
    const result: unknown = JSON.parse(text);
    if (
      typeof result === "object" &&
      result !== null &&
      "output" in result &&
      typeof result.output === "string"
    )
      return `${result.output}${"exitCode" in result ? `\nExit code: ${result.exitCode}` : ""}${"truncated" in result && result.truncated ? "\nOutput truncated by the tool." : ""}`.trim();
    return JSON.stringify(result, null, 2);
  } catch {
    return text;
  }
}

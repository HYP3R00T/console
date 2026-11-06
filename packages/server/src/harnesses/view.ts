import type {
  ConversationView,
  EntryRecord,
  InboxState,
  LiveState,
} from "@earendil-works/pi-durable";
import { attachedInput } from "./attachments.ts";
import { queueView } from "./queue.ts";

const visibleTools = new Set([
  // Keep results from the retired inspection tools visible in saved history.
  "list_directory",
  "read_file",
  "search_text",
  "read",
  "write",
  "edit",
  "bash",
]);
type ChatMessage = {
  id: string;
  entryId: number;
  role: "user" | "assistant" | "tool";
  text: string;
  failed: boolean;
  attachments?: {
    name: string;
    mimeType: string;
    size: number;
    index: number;
    thumbnail?: string;
  }[];
  toolName?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
};

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}
function preview(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n[Preview truncated]`
    : value;
}
const failureReasons = new Set([
  "aborted",
  "model_error",
  "no_model",
  "run_failed",
  "withdrawn",
  "interrupted",
  "restart_limit",
  "nothing_to_answer",
  "turn_limit",
  "reset",
  "faulted",
  "orphaned",
  "missing_task",
  "task_too_old",
  "migration_failed",
  "stale",
]);
const safeReason = (reason: string) =>
  failureReasons.has(reason) ? reason : "failed";

/** Only publish stable lifecycle metadata. Diagnostics can contain credentials or provider payloads. */
export function executionView(live: LiveState | undefined) {
  const tools = (live?.tools ?? [])
    .filter((tool) => visibleTools.has(tool.name) && tool.status !== "done")
    .map(({ callId, name, status }) => ({ callId, name, status }));
  const compactions = (live?.compactions ?? []).map(
    ({ taskId, trigger, blocking, attempt, retry }) => ({
      taskId,
      trigger,
      blocking,
      attempt,
      ...(retry ? { retryAt: retry.at } : {}),
    }),
  );
  return {
    state: !live?.run
      ? "idle"
      : live.run.afterRun
        ? "finishing"
        : live.generation?.retry
          ? "retrying"
          : compactions.some((task) => task.blocking)
            ? "compacting"
            : tools.length
              ? "tools"
              : live.generation?.deferred
                ? "deferred"
                : "running",
    ...(live?.generation ? { attempt: live.generation.attempt } : {}),
    ...(live?.generation?.retry ? { retryAt: live.generation.retry.at } : {}),
    ...(live?.generation?.deferred
      ? { pollAt: live.generation.deferred.pollAt }
      : {}),
    ...(live?.runFailure
      ? {
          failure: {
            reason: safeReason(live.runFailure.reason),
            taskId: live.runFailure.taskId,
          },
        }
      : {}),
    ...(live?.compactionFailure
      ? { compactionFailure: { trigger: live.compactionFailure.trigger } }
      : {}),
    tools,
    compactions,
  };
}

/** Raw entry boundaries include invisible system/reset/compaction records. */
export function historyWindow(
  entries: readonly EntryRecord[],
  before?: EntryRecord["id"],
) {
  return {
    ids: entries.map((entry) => entry.id),
    ...(before === undefined ? {} : { before }),
  };
}
export function messages(entries: readonly EntryRecord[]) {
  return entries.flatMap((entry) =>
    (entry.model ?? []).flatMap<ChatMessage>((message, index) => {
      if (message.role === "toolResult" && visibleTools.has(message.toolName))
        return [
          {
            id: `${entry.id}:${index}`,
            entryId: entry.id,
            role: "tool" as const,
            text: preview(text(message.content), 4000),
            failed: message.isError,
            toolName: message.toolName,
          },
        ];
      if (message.role !== "user" && message.role !== "assistant") return [];
      const calls =
        message.role === "assistant"
          ? message.content
              .filter(
                (block) =>
                  block.type === "toolCall" && visibleTools.has(block.name),
              )
              .map((block) => ({
                id: block.type === "toolCall" ? block.id : "",
                name: block.type === "toolCall" ? block.name : "",
                arguments:
                  block.type === "toolCall"
                    ? preview(JSON.stringify(block.arguments), 1000)
                    : "",
              }))
          : [];
      if (
        !text(message.content) &&
        !calls.length &&
        message.role === "assistant" &&
        message.stopReason === "toolUse"
      )
        return [];
      return [
        {
          id: `${entry.id}:${index}`,
          entryId: entry.id,
          role: message.role,
          text:
            message.role === "user"
              ? (attachedInput(entry)?.text ?? text(message.content))
              : text(message.content),
          ...(message.role === "user" && attachedInput(entry)
            ? {
                attachments: attachedInput(entry)?.attachments.map(
                  ({ name, mimeType, size, thumbnail }, index) => ({
                    name,
                    mimeType,
                    size,
                    index,
                    ...(thumbnail ? { thumbnail } : {}),
                  }),
                ),
              }
            : {}),
          ...(calls.length ? { toolCalls: calls } : {}),
          failed:
            message.role === "assistant" &&
            ["error", "aborted"].includes(message.stopReason),
        },
      ];
    }),
  );
}
export function conversationView(view: ConversationView) {
  const live = view.docs["pi.live"] as LiveState | undefined;
  const generation = live?.generation as
    | { message?: { content?: unknown } }
    | undefined;
  const inbox = view.docs["pi.inbox"] as InboxState | undefined;
  const agent = view.docs["pi.agent"];
  const entries = view.entries.slice(-50);
  return {
    id: view.conversation.id,
    messages: messages(entries),
    history: historyWindow(
      entries,
      view.entries.length > 50 ? view.entries.at(-51)?.id : view.before,
    ),
    execution: executionView(live),
    hasEarlier: view.before !== undefined || view.entries.length > 50,
    busy: !!live?.run,
    partial: text(generation?.message?.content),
    activeTools: ((live?.tools ?? []) as { name: string; status: string }[])
      .filter((tool) => visibleTools.has(tool.name) && tool.status !== "done")
      .map(({ name, status }) => ({ name, status })),
    queued: inbox?.items?.length ?? 0,
    queue: queueView(inbox?.items ?? []),
    model: agent?.model,
    thinkingLevel: agent?.thinkingLevel,
  };
}

/** Submission details/trace may contain provider diagnostics; only publish stable lifecycle fields. */
export function submissionView(
  record: import("@earendil-works/pi-durable").SubmissionRecord,
) {
  return {
    id: record.id,
    conversationId: record.conversationId,
    type: record.type,
    status: record.status,
    ...(record.entry !== undefined ? { entry: record.entry } : {}),
    ...(record.answer !== undefined ? { answer: record.answer } : {}),
    ...(record.status === "unanswered"
      ? { reason: safeReason(record.reason) }
      : {}),
  };
}

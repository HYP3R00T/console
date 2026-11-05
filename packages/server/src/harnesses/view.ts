import type {
  ConversationView,
  EntryRecord,
  InboxState,
} from "@earendil-works/pi-durable";
import { attachedInput } from "./attachments.ts";
import { queueView } from "./queue.ts";

const inspectionTools = new Set(["list_directory", "read_file", "search_text"]);
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
export function messages(entries: readonly EntryRecord[]) {
  return entries.flatMap((entry) =>
    (entry.model ?? []).flatMap<ChatMessage>((message, index) => {
      if (
        message.role === "toolResult" &&
        inspectionTools.has(message.toolName)
      )
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
                  block.type === "toolCall" && inspectionTools.has(block.name),
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
  const live = view.docs["pi.live"];
  const generation = live?.generation as
    | { message?: { content?: unknown } }
    | undefined;
  const inbox = view.docs["pi.inbox"] as InboxState | undefined;
  const agent = view.docs["pi.agent"];
  return {
    id: view.conversation.id,
    messages: messages(view.entries.slice(-50)),
    hasEarlier: view.entries.length > 50,
    busy: !!live?.run,
    partial: text(generation?.message?.content),
    activeTools: ((live?.tools ?? []) as { name: string; status: string }[])
      .filter(
        (tool) => inspectionTools.has(tool.name) && tool.status !== "done",
      )
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
  const reasons = new Set([
    "aborted",
    "model_error",
    "no_model",
    "run_failed",
    "withdrawn",
    "interrupted",
    "restart_limit",
  ]);
  return {
    id: record.id,
    conversationId: record.conversationId,
    type: record.type,
    status: record.status,
    ...(record.entry !== undefined ? { entry: record.entry } : {}),
    ...(record.answer !== undefined ? { answer: record.answer } : {}),
    ...(record.status === "unanswered"
      ? { reason: reasons.has(record.reason) ? record.reason : "failed" }
      : {}),
  };
}

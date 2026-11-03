import type { ConversationView, EntryRecord } from "@earendil-works/pi-durable";

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}
export function messages(entries: readonly EntryRecord[]) {
  return entries.flatMap((entry) =>
    (entry.model ?? []).flatMap((message, index) => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      return [
        {
          id: `${entry.id}:${index}`,
          entryId: entry.id,
          role: message.role,
          text: text(message.content),
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
  const inbox = view.docs["pi.inbox"] as { items?: unknown[] } | undefined;
  const agent = view.docs["pi.agent"];
  return {
    id: view.conversation.id,
    messages: messages(view.entries.slice(-50)),
    hasEarlier: view.entries.length > 50,
    busy: !!live?.run,
    partial: text(generation?.message?.content),
    queued: inbox?.items?.length ?? 0,
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

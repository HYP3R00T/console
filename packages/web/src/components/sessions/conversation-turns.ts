import type { ChatMessage } from "./use-conversation.ts";

export type ConversationTurn = {
  id: string;
  prompt?: ChatMessage;
  replies: ChatMessage[];
  activity: {
    id: string;
    label: string;
    content: string;
    failed: boolean;
    callId?: string;
    reviewId?: number;
  }[];
};

/** Chronological display groups, not independent Durable runs: steering can join an existing run. */
export function conversationTurns(messages: ChatMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | undefined;
  for (const message of messages) {
    if (message.role === "user" || !current) {
      current = {
        id: message.id,
        replies: [],
        activity: [],
        ...(message.role === "user" ? { prompt: message } : {}),
      };
      turns.push(current);
    }
    if (message.role === "assistant") {
      if (message.text || message.attachments?.length || message.failed)
        current.replies.push(message);
      for (const call of message.toolCalls ?? [])
        current.activity.push({
          id: `${message.id}:${call.id}`,
          label: `${call.name} · Arguments`,
          content: call.arguments,
          failed: false,
          callId: call.id,
        });
    } else if (message.role === "tool") {
      current.activity.push({
        id: message.id,
        label:
          message.activityLabel ??
          `${message.toolName ?? "Tool"} · ${message.failed ? "Failed" : "Completed"}`,
        content: message.text,
        failed: message.failed,
        reviewId: message.reviewId,
      });
    }
  }
  return turns;
}

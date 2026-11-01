import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import {
  type Conversation,
  type EntryId,
  type Harness,
  LiveDoc,
} from "@earendil-works/pi-durable";
import type { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { httpError } from "../http/errors.ts";

function text(message: Message) {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}
export function conversationView(
  harness: Harness,
  storage: Awaited<ReturnType<typeof openNodeSqliteStorage>>,
  root: Conversation,
) {
  async function history(before?: string) {
    if (
      before &&
      (!/^[1-9]\d*$/.test(before) || !Number.isSafeInteger(Number(before)))
    )
      throw httpError(400, "Invalid history cursor.");
    const page = await root.entries(
      {
        order: "descending",
        ...(before ? { maxEntryId: (Number(before) - 1) as EntryId } : {}),
      },
      50,
      undefined,
      context,
    );
    return {
      hasOlder: Boolean(page.next),
      olderCursor: page.next ? String(page.items.at(-1)?.id) : undefined,
      messages: [...page.items].reverse().flatMap((entry) =>
        (entry.model ?? []).map((message, index) => ({
          id: `${entry.id}-${index}`,
          entryId: String(entry.id),
          kind: entry.kind,
          role: message.role,
          text: text(message),
          ...(message.role === "toolResult"
            ? {
                toolName: message.toolName,
                toolCallId: message.toolCallId,
                isError: message.isError,
              }
            : {}),
          ...(message.role === "assistant"
            ? {
                reasoning: message.content.flatMap((block) =>
                  block.type === "thinking" && !block.redacted
                    ? [block.thinking]
                    : [],
                ),
                toolCalls: message.content.flatMap((block) =>
                  block.type === "toolCall"
                    ? [
                        {
                          id: block.id,
                          name: block.name,
                          arguments: block.arguments,
                        },
                      ]
                    : [],
                ),
              }
            : {}),
        })),
      ),
    };
  }
  return {
    history,
    async snapshot() {
      const live = await harness.snapshot(LiveDoc, root.id, context);
      const latest = (
        await storage.scanSubmissions(
          { conversationId: root.id, order: "descending" },
          1,
          undefined,
          context,
        )
      ).items[0];
      return {
        ...(await history()),
        partial: live?.generation?.message ? text(live.generation.message) : "",
        liveTools: (live?.tools ?? []).map((tool) => ({
          id: tool.callId,
          name: tool.name,
          status: tool.status,
          output: tool.output,
        })),
        outcome:
          latest?.status === "unanswered" ? latest.reason : latest?.status,
        compactionFailed: Boolean(live?.compactionFailure),
      };
    },
  };
}

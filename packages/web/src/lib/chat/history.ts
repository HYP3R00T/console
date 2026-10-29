import type { Conversation } from "../api.ts";
export type HistoryPage = Pick<
  Conversation,
  "messages" | "hasOlder" | "olderCursor"
>;
// Pi entry IDs are monotonically minted. Include the message index for entries with multiple messages.
export function mergeMessages(
  previous: Conversation["messages"],
  incoming: Conversation["messages"],
) {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => {
    const [aEntry, aIndex] = a.id.split("-").map(Number);
    const [bEntry, bIndex] = b.id.split("-").map(Number);
    return aEntry - bEntry || aIndex - bIndex;
  });
}

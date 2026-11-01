import type { ChatMessage } from "./api.ts";
export function mergeMessages(
  previous: ChatMessage[],
  incoming: ChatMessage[],
) {
  const rows = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) rows.set(message.id, message);
  return [...rows.values()].sort((a, b) => {
    const [ae, ai] = a.id.split("-").map(Number);
    const [be, bi] = b.id.split("-").map(Number);
    return ae - be || ai - bi;
  });
}

import { type ProjectPins, parseProjectPins } from "./project-pins.ts";
export const conversationPinsKey = "console.conversation-pins.v1";
export const conversationKey = (sessionId: string, id: number) =>
  `${sessionId}:${id}`;
export function parseConversationPins(value: string | null): ProjectPins {
  const pins = parseProjectPins(value);
  for (const ids of Object.values(pins))
    if (ids.some((id) => !/^[0-9a-f-]{36}:(0|[1-9][0-9]{0,14})$/i.test(id)))
      throw new Error("Invalid conversation pins.");
  return pins;
}
export function orderConversations<T>(
  items: T[],
  key: (item: T) => string,
  pins: string[],
): T[] {
  const positions = new Map(pins.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) =>
      (positions.get(key(a)) ?? pins.length) -
      (positions.get(key(b)) ?? pins.length),
  );
}

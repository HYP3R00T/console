export type NavigationDragItem =
  | { kind: "project"; id: string }
  | { kind: "conversation"; sessionId: string; id: number; projectId?: string };
export type NavigationDropTarget =
  | "pinned"
  | "projects"
  | "recents"
  | { projectId: string };
export type NavigationDropIntent = { pinned: boolean } | { reason: string };

/** Sidebar placement never changes Durable ownership or execution scope. */
export function navigationDropIntent(
  item: NavigationDragItem,
  target: NavigationDropTarget,
): NavigationDropIntent {
  if (target === "pinned") return { pinned: true };
  if (item.kind === "project")
    return target === "projects"
      ? { pinned: false }
      : { reason: "Projects can be dropped into Pinned or Projects." };
  if (target === "recents" && !item.projectId) return { pinned: false };
  if (typeof target === "object" && target.projectId === item.projectId)
    return { pinned: false };
  return {
    reason:
      "Moving chats between projects and Recents needs a Durable transfer operation. Pin this chat instead; its history and workspace stay unchanged.",
  };
}

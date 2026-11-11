/** Entity capabilities are explicit; unsupported backend actions are not advertised. */
export const navigationActions = {
  project: [
    "create-conversation",
    "create-session",
    "workflows",
    "toggle-pin",
    "edit",
    "remove",
  ],
  conversation: ["rename", "toggle-pin", "archive"],
  session: ["create-conversation"],
  section: ["toggle-section", "add-project", "create-conversation"],
} as const;
export type NavigationEntityKind = keyof typeof navigationActions;
export type NavigationActionId =
  (typeof navigationActions)[NavigationEntityKind][number];
export function supportsNavigationAction(
  kind: NavigationEntityKind,
  id: NavigationActionId,
): boolean {
  return (navigationActions[kind] as readonly string[]).includes(id);
}

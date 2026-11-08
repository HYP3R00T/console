export const inspectorScopes = ["project", "session", "conversation"] as const;
export const inspectorSections = [
  "tools",
  "instructions",
  "context",
  "tasks",
] as const;
export type InspectorScope = (typeof inspectorScopes)[number];
export type InspectorSection = (typeof inspectorSections)[number];
export type InspectorSelection = {
  scope: InspectorScope;
  section: InspectorSection;
};
export const defaultInspectorSelection: InspectorSelection = {
  scope: "conversation",
  section: "tools",
};
export function inspectorPreferenceKey(
  backend: string,
  session: string,
  conversation: string,
) {
  return JSON.stringify([backend, session, conversation]);
}
export function parseInspectorSelection(
  value: unknown,
): InspectorSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const data = value as Record<string, unknown>;
  if (
    !inspectorScopes.includes(data.scope as InspectorScope) ||
    !inspectorSections.includes(data.section as InspectorSection)
  )
    return;
  return {
    scope: data.scope as InspectorScope,
    section: data.section as InspectorSection,
  };
}
export function availableInspectorSelection(
  selection: InspectorSelection | undefined,
  hasProject: boolean,
): InspectorSelection {
  const next = selection ?? defaultInspectorSelection;
  return next.scope === "project" && !hasProject
    ? { ...next, scope: "conversation" }
    : next;
}

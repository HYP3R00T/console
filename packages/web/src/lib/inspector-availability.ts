import type { InspectorSection } from "./inspector-preferences.ts";

type InspectorFeatures = {
  postRunCommand?: string | null;
  context?: unknown;
  worktree?: string | null;
  sandbox?: boolean;
  remote?: unknown;
  codeMode?: boolean;
  mcp?: unknown;
  managedExtensions?: unknown;
};
/** Feature presence, not its enabled value, determines whether its editor exists. */
export function inspectorSectionAvailable(
  section: InspectorSection,
  data?: InspectorFeatures,
) {
  if (!data) return false;
  if (
    ["tasks", "agents", "review", "job", "history", "checks"].includes(section)
  )
    return data.postRunCommand !== undefined;
  if (section === "context") return !!data.context;
  if (section === "workspace")
    return (
      data.worktree !== undefined || data.sandbox !== undefined || !!data.remote
    );
  if (section === "integrations")
    return (
      data.codeMode !== undefined || !!data.mcp || !!data.managedExtensions
    );
  return true;
}

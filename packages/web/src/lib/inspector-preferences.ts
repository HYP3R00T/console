export const inspectorScopes = ["project", "session", "conversation"] as const;
export const inspectorSections = [
  "overview",
  "tools",
  "workspace",
  "integrations",
  "instructions",
  "context",
  "checks",
  "tasks",
  "agents",
  "review",
  "job",
  "history",
  "status",
] as const;
export type InspectorScope = (typeof inspectorScopes)[number];
export type InspectorSection = (typeof inspectorSections)[number];
export type InspectorSelection = {
  scope: InspectorScope;
  section: InspectorSection;
};
export const defaultInspectorSelection: InspectorSelection = {
  scope: "conversation",
  section: "overview",
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

export const inspectorSectionInfo: Record<
  InspectorSection,
  { label: string; description: string }
> = {
  overview: {
    label: "Overview",
    description: "Find every control and see what is active.",
  },
  tools: {
    label: "Behavior & tool access",
    description: "Plan mode and tools permitted for this conversation.",
  },
  workspace: {
    label: "Workspace & isolation",
    description: "Project directory, Git worktree, sandbox or SSH host.",
  },
  integrations: {
    label: "Integrations",
    description: "MCP servers, managed extensions and tool scripting.",
  },
  instructions: {
    label: "Instructions",
    description: "Conversation guidance and the effective shared instructions.",
  },
  context: {
    label: "Context & usage",
    description: "Models, tokens, cost, run limits and compaction.",
  },
  tasks: {
    label: "Automation",
    description: "Active work and entry points for agents, jobs and reviews.",
  },
  agents: {
    label: "Background agents",
    description: "Create, message, inspect and stop named agents.",
  },
  review: {
    label: "Schedule review",
    description: "Read-only reviews, model selection and repeat schedules.",
  },
  job: {
    label: "Schedule job",
    description: "Instructions, agent profiles, timing and result delivery.",
  },
  history: {
    label: "Task history & recovery",
    description:
      "Inspect receipts and retry eligible jobs, reviews and checks.",
  },
  checks: {
    label: "Post-run checks",
    description:
      "A check command and bounded repair attempts after answered turns.",
  },
  status: {
    label: "Effective status",
    description:
      "Confirmed workspace, model, modes, integration access and execution.",
  },
};

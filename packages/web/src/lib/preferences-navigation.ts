export type PreferenceTarget = {
  deviceId?: string;
  projectId?: string;
  sessionId?: string;
  conversationId?: string;
};
export const clientPreferencePages = [
  { label: "Appearance", path: "/settings/appearance" },
  { label: "Keyboard shortcuts", path: "/settings/shortcuts" },
  { label: "Configuration backup", path: "/settings/configuration" },
] as const;
export const machinePreferencePages = [
  { id: "providers", label: "Providers" },
  { id: "runtime", label: "Runtime defaults" },
  { id: "guidance", label: "Workspace guidance" },
  { id: "reviewers", label: "Reviewer profiles" },
  { id: "agents", label: "Agent profiles" },
  { id: "integrations", label: "MCP and SSH" },
  { id: "extensions", label: "Extensions" },
  { id: "projects", label: "Projects folder" },
  { id: "archives", label: "Archives" },
] as const;
export function preferencesHref(
  target: PreferenceTarget = {},
  path = "/settings",
) {
  const query = new URLSearchParams();
  if (target.deviceId) {
    query.set("machine", target.deviceId);
    if (target.projectId) query.set("project", target.projectId);
    if (target.sessionId) {
      query.set("session", target.sessionId);
      if (target.conversationId)
        query.set("conversation", target.conversationId);
    }
  }
  return `${path}${query.size ? `?${query}` : ""}`;
}
export function preferenceTarget(
  params: PreferenceTarget,
  query: Pick<URLSearchParams, "get">,
): PreferenceTarget {
  const deviceId = params.deviceId ?? query.get("machine") ?? undefined;
  if (!deviceId) return {};
  const projectId = params.projectId ?? query.get("project") ?? undefined;
  const sessionId = params.sessionId ?? query.get("session") ?? undefined;
  return {
    deviceId,
    projectId,
    sessionId,
    conversationId: sessionId
      ? (params.conversationId ?? query.get("conversation") ?? undefined)
      : undefined,
  };
}
export function isPreferencesPath(path: string) {
  return (
    path === "/settings" ||
    path.startsWith("/settings/") ||
    /^\/devices\/[^/]+(?:\/.*)?\/settings(?:\/|$)/.test(path)
  );
}
export function conversationSettingsHref(
  deviceId: string,
  sessionId: string,
  conversationId: string | number,
) {
  return `/devices/${encodeURIComponent(deviceId)}/sessions/${encodeURIComponent(sessionId)}/conversations/${encodeURIComponent(conversationId)}/settings`;
}

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
export type MachinePreferenceCategory =
  (typeof machinePreferencePages)[number]["id"];
export function machinePreferenceCategory(
  path: string,
): MachinePreferenceCategory | undefined {
  const match =
    /^(?:\/devices\/[^/]+\/settings|\/settings\/machines)\/([^/]+)$/.exec(path);
  return machinePreferencePages.find((page) => page.id === match?.[1])?.id;
}
export function machinePreferenceHref(
  category: MachinePreferenceCategory,
  deviceId?: string,
) {
  return deviceId
    ? `/devices/${encodeURIComponent(deviceId)}/settings/${category}`
    : `/settings/machines/${category}`;
}
export function preferenceMachine<T extends { id: string }>(
  devices: T[],
  preferredId?: string,
) {
  return devices.find((device) => device.id === preferredId) ?? devices[0];
}
export function preferencesHref(
  target: PreferenceTarget = {},
  path: string = clientPreferencePages[0].path,
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

export type SettingsDestination = {
  destination: string;
  target: PreferenceTarget;
};
/** Explicit palette destinations only navigate to existing editors; they never apply values. */
export function settingsDestinationHref(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid settings destination.");
  const { destination, target } = value as SettingsDestination;
  if (
    typeof destination !== "string" ||
    !target ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    Object.values(target).some(
      (id) =>
        id !== undefined && (typeof id !== "string" || !id || id.length > 1024),
    )
  )
    throw new Error("Invalid settings target.");
  const client = clientPreferencePages.find(
    (page) => page.path === destination,
  );
  if (client) return preferencesHref(target, client.path);
  if (!target.deviceId) throw new Error("Select a machine first.");
  const machine = machinePreferencePages.find(
    (page) => `machine:${page.id}` === destination,
  );
  if (machine) return machinePreferenceHref(machine.id, target.deviceId);
  const base = `/devices/${encodeURIComponent(target.deviceId)}`;
  if (destination === "project" && target.projectId)
    return `${base}/projects/${encodeURIComponent(target.projectId)}/settings`;
  if (destination === "session" && target.sessionId)
    return `${base}/sessions/${encodeURIComponent(target.sessionId)}/settings`;
  if (
    destination === "conversation" &&
    target.sessionId &&
    target.conversationId &&
    target.conversationId !== "new"
  )
    return conversationSettingsHref(
      target.deviceId,
      target.sessionId,
      target.conversationId,
    );
  throw new Error("Select the owning settings scope first.");
}
export function scopedSettingsDestinations(target: PreferenceTarget) {
  const result: { label: string; input: SettingsDestination }[] = [];
  if (!target.deviceId) return result;
  for (const page of machinePreferencePages)
    result.push({
      label: page.label,
      input: {
        destination: `machine:${page.id}`,
        target: { deviceId: target.deviceId },
      },
    });
  if (target.projectId)
    result.push({
      label: "Project agent settings",
      input: {
        destination: "project",
        target: { deviceId: target.deviceId, projectId: target.projectId },
      },
    });
  if (target.sessionId)
    result.push({
      label: "Session runtime settings",
      input: {
        destination: "session",
        target: {
          deviceId: target.deviceId,
          projectId: target.projectId,
          sessionId: target.sessionId,
        },
      },
    });
  if (
    target.sessionId &&
    target.conversationId &&
    target.conversationId !== "new"
  )
    result.push({
      label: "Conversation settings",
      input: { destination: "conversation", target },
    });
  return result;
}

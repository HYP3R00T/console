import type { CommandId } from "./commands.ts";
import { standaloneConversationPath } from "./conversation-path.ts";
import type { PreferenceTarget } from "./preferences-navigation.ts";

export type PaletteTarget = PreferenceTarget;
export type PaletteKind = "machine" | "project" | "session" | "conversation";
export type PaletteDestination = {
  id: string;
  kind: PaletteKind;
  label: string;
  path: string[];
  target: PaletteTarget;
  href?: string;
  description?: string;
  pinned?: boolean;
  disabled?: string;
};
export function targetKey(target: PaletteTarget) {
  return JSON.stringify([
    target.deviceId,
    target.projectId,
    target.sessionId,
    target.conversationId,
  ]);
}
export function withinScope(target: PaletteTarget, scope: PaletteTarget) {
  return (
    ["deviceId", "projectId", "sessionId", "conversationId"] as const
  ).every((key) => !scope[key] || target[key] === scope[key]);
}
export function paletteAncestors(
  target: PaletteTarget,
): { kind: PaletteKind; target: PaletteTarget }[] {
  const { deviceId, projectId, sessionId, conversationId } = target;
  if (!deviceId) return [];
  return [
    { kind: "machine" as const, target: { deviceId } },
    ...(projectId
      ? [{ kind: "project" as const, target: { deviceId, projectId } }]
      : []),
    ...(sessionId
      ? [
          {
            kind: "session" as const,
            target: { deviceId, projectId, sessionId },
          },
        ]
      : []),
    ...(sessionId && conversationId
      ? [
          {
            kind: "conversation" as const,
            target: { deviceId, projectId, sessionId, conversationId },
          },
        ]
      : []),
  ];
}
export function conversationHref(target: PaletteTarget) {
  const { deviceId, projectId, sessionId, conversationId } = target;
  if (!deviceId || !sessionId || !conversationId) return;
  const base = `/devices/${encodeURIComponent(deviceId)}`;
  return projectId
    ? `${base}/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/conversations/${encodeURIComponent(conversationId)}`
    : standaloneConversationPath(
        `${base}/conversations`,
        sessionId,
        conversationId,
      );
}
/** Actions keep the current view's target even when browsing another destination. */
export function paletteCommandTarget(
  id: CommandId,
  current: PaletteTarget,
): PaletteTarget | "client" {
  if (
    id.startsWith("preferences.") ||
    id.startsWith("appearance.") ||
    id === "navigation.conversations" ||
    id === "settings.open" ||
    id === "navigation.home" ||
    id === "navigation.devices"
  )
    return "client";
  const { deviceId, projectId, sessionId, conversationId } = current;
  if (id.startsWith("machine.")) return { deviceId };
  if (id.startsWith("project.")) return { deviceId, projectId };
  if (id.startsWith("session.")) return { deviceId, projectId, sessionId };
  if (id === "conversation.new") return { deviceId, projectId, sessionId };
  return { deviceId, projectId, sessionId, conversationId };
}
export function paletteCommandGroup(id: CommandId) {
  return /settings|preferences|^appearance\.|\.configure$|\.update$|^machine\.(providers|projects|runtime|archives|reviewers|agents|integrations|extensions)$/.test(
    id,
  )
    ? "Settings"
    : "Actions";
}
export function targetLabel(
  target: PaletteTarget,
  destinations: PaletteDestination[],
) {
  const labels = paletteAncestors(target).map(
    ({ target: ancestor, kind }) =>
      destinations.find(
        (item) => targetKey(item.target) === targetKey(ancestor),
      )?.label ??
      (kind === "machine"
        ? `Machine ${ancestor.deviceId}`
        : kind === "project"
          ? `Project ${ancestor.projectId}`
          : kind === "session"
            ? `Session ${ancestor.sessionId?.slice(0, 8)}`
            : ancestor.conversationId === "new"
              ? "New conversation"
              : `Conversation ${ancestor.conversationId}`),
  );
  if (target.conversationId === "new" && !target.sessionId)
    labels.push("New conversation");
  return labels.join(" / ") || "Current view";
}
export function searchDestinations(
  destinations: PaletteDestination[],
  scope: PaletteTarget,
  query: string,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return destinations.filter(
    (item) =>
      withinScope(item.target, scope) &&
      terms.every((term) =>
        `${item.label} ${item.path.join(" ")} ${item.kind}`
          .toLocaleLowerCase()
          .includes(term),
      ),
  );
}
/** Restore only validated workspace paths; never infer a project for standalone sessions. */
export function paletteTargetFromPath(path: string): PaletteTarget | undefined {
  if (
    !/^\/devices\/[^/?#]+\/(?:conversations\/[^/?#]+(?:\/[1-9][0-9]*)?|projects\/[^/?#]+\/conversations\/new|projects\/[^/?#]+\/sessions\/[^/?#]+\/conversations\/[^/?#]+)$/.test(
      path,
    )
  )
    return;
  try {
    const parts = path.split("/").map(decodeURIComponent);
    const deviceId = parts[2];
    if (parts[3] === "conversations")
      return parts[4] === "new"
        ? { deviceId, conversationId: "new" }
        : { deviceId, sessionId: parts[4], conversationId: parts[5] ?? "1" };
    return parts[5] === "conversations"
      ? { deviceId, projectId: parts[4], conversationId: "new" }
      : {
          deviceId,
          projectId: parts[4],
          sessionId: parts[6],
          conversationId: parts[8],
        };
  } catch {
    return;
  }
}
export function rememberedDestinations(
  destinations: PaletteDestination[],
  routes: string[],
) {
  const result: PaletteDestination[] = [];
  for (const href of routes) {
    const target = paletteTargetFromPath(href);
    if (
      !target ||
      !destinations.some(
        (item) =>
          item.kind === "machine" && item.target.deviceId === target.deviceId,
      )
    )
      continue;
    const found = destinations.find(
      (item) => targetKey(item.target) === targetKey(target),
    );
    if (found) result.push(found);
    else {
      const path = targetLabel(target, destinations).split(" / ");
      result.push({
        id: `remembered:${href}`,
        kind: "conversation",
        label: path.at(-1) ?? "Conversation",
        path,
        target,
        href,
      });
    }
  }
  return result.filter(
    (item, i) =>
      result.findIndex(
        (other) => targetKey(other.target) === targetKey(item.target),
      ) === i,
  );
}

export function paletteSelectionIsCurrent(
  selected: { route: string; url: string; client?: unknown },
  current: { route: string; url: string; client?: unknown },
) {
  return (
    selected.route === current.route &&
    selected.url === current.url &&
    selected.client === current.client
  );
}

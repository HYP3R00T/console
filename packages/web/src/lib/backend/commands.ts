import type { BackendClient } from "./client.ts";
export type CommandTarget = {
  projectId?: string;
  sessionId?: string;
  conversationId?: string;
};
export const backendOperations = {
  "machine.workspace-guidance.update": [
    "PATCH",
    "/v1/machine/workspace-guidance",
  ],
  "machine.runtime-defaults.update": ["PUT", "/v1/machine/runtime-defaults"],
  "project.agent-settings.update": [
    "PATCH",
    "/v1/projects/:projectId/agent-settings",
  ],
  "session.runtime-settings.update": [
    "PATCH",
    "/v1/sessions/:sessionId/runtime-settings",
  ],
  "conversation.configure": [
    "PATCH",
    "/v1/sessions/:sessionId/conversations/:conversationId/configuration",
  ],
  "conversation.stop": [
    "POST",
    "/v1/sessions/:sessionId/conversations/:conversationId/stop",
  ],
  "conversation.continue": [
    "POST",
    "/v1/sessions/:sessionId/conversations/:conversationId/continue",
  ],
  "conversation.compact": [
    "POST",
    "/v1/sessions/:sessionId/conversations/:conversationId/compact",
  ],
} as const;
export type BackendCommandId = keyof typeof backendOperations;
export function executeBackendCommand<T>(
  client: Pick<BackendClient, "request">,
  id: BackendCommandId,
  target: CommandTarget,
  input: unknown,
) {
  const [method, template] = backendOperations[id];
  const path = template.replace(
    /:(projectId|sessionId|conversationId)/g,
    (_match, key: keyof CommandTarget) => {
      const value = target[key];
      if (!value)
        throw new Error(`Select a ${key} before invoking this command.`);
      return encodeURIComponent(value);
    },
  );
  return client.request<T>(path, { method, body: JSON.stringify(input) });
}

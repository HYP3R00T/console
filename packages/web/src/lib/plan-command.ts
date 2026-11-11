import type { BackendClient } from "./backend/client.ts";
import {
  type CommandTarget,
  executeBackendCommand,
} from "./backend/commands.ts";

/** Resolve intent from a fresh confirmed snapshot, then retain its revision and target. */
export async function togglePlanMode<T>(
  client: Pick<BackendClient, "request">,
  target: CommandTarget,
): Promise<T> {
  if (!target.sessionId || !target.conversationId)
    throw new Error("Select a conversation first.");
  const captured = { ...target };
  const path = `/v1/sessions/${encodeURIComponent(captured.sessionId as string)}/conversations/${encodeURIComponent(captured.conversationId as string)}/configuration`;
  const current = await client.request<{
    revision: string;
    plan?: { active: boolean };
  }>(path);
  if (!current.plan || typeof current.plan.active !== "boolean")
    throw new Error("Plan mode is unavailable on this backend.");
  return executeBackendCommand<T>(client, "conversation.configure", captured, {
    revision: current.revision,
    planMode: !current.plan.active,
  });
}

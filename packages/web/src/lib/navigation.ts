import {
  api,
  type ConversationSummary,
  type SessionSummary,
  type Workspace,
} from "./api.ts";

export async function loadProjectTree(machineId: string, signal: AbortSignal) {
  const [projects, sessions] = await Promise.all([
    api<Workspace[]>("/workspaces", "GET", undefined, signal, machineId),
    api<SessionSummary[]>(
      "/sessions?include=conversations",
      "GET",
      undefined,
      signal,
      machineId,
    ),
  ]);
  const entries = await Promise.all(
    sessions
      .filter((session) => session.status !== "unavailable")
      .map(
        async (session) =>
          [
            session.id,
            // Older servers ignore include; keep their existing per-session path.
            session.conversations ??
              (await api<ConversationSummary[]>(
                `/sessions/${session.id}/conversations`,
                "GET",
                undefined,
                signal,
                machineId,
              )),
          ] as const,
      ),
  );
  return { projects, sessions, conversations: Object.fromEntries(entries) };
}

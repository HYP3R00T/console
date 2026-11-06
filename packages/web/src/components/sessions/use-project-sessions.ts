"use client";
import { useEffect, useState } from "react";
import { useMachineProjects } from "@/components/projects/projects-provider";
export type SessionRecord = {
  id: string;
  sessionId: string;
  name: string;
  number: number;
  projectId: string;
  provider: string;
  modelId: string;
};
export type Conversation = {
  id: number;
  name: string;
  parent?: { conversationId: number; at: number };
};
export type Session = {
  session: SessionRecord;
  conversations: Conversation[];
  more: boolean;
};
export function sessionsChanged() {
  window.dispatchEvent(new Event("console:sessions-changed"));
}
export function useProjectSessions(
  deviceId: string,
  projectId: string,
  enabled = true,
) {
  const { connected, origin, client, request } = useMachineProjects(deviceId);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    client: typeof client;
    sessions?: Session[];
    error?: string;
  }>();
  const key = `${connected ? origin : ""}:${projectId}`;
  useEffect(() => {
    if (!connected || !enabled) return;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const load = async () => {
      clearTimeout(timer);
      controller?.abort();
      const operation = new AbortController();
      controller = operation;
      try {
        const data = await request<{ sessions: SessionRecord[] }>(
          `/v1/projects/${projectId}/sessions`,
          { signal: operation.signal },
        );
        const sessions = await Promise.all(
          data.sessions.map((session) =>
            request<Session>(
              `/v1/sessions/${session.sessionId}/conversations`,
              { signal: operation.signal },
            ),
          ),
        );
        if (!operation.signal.aborted) setSnapshot({ key, client, sessions });
      } catch (cause) {
        if (!operation.signal.aborted)
          setSnapshot((previous) => ({
            key,
            client,
            sessions:
              previous?.key === key && previous.client === client
                ? previous.sessions
                : undefined,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load sessions.",
          }));
      } finally {
        if (!stopped && !operation.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    };
    void load();
    window.addEventListener("console:sessions-changed", load);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(timer);
      window.removeEventListener("console:sessions-changed", load);
    };
  }, [connected, enabled, key, client, projectId, request]);
  return {
    ...(snapshot?.key === key && snapshot?.client === client ? snapshot : {}),
    connected,
    request,
    refresh: sessionsChanged,
  };
}

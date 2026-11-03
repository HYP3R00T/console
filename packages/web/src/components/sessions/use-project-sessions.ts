"use client";
import { useCallback, useEffect, useState } from "react";
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
export type Conversation = { id: number; name: string };
export type Session = {
  session: SessionRecord;
  conversations: Conversation[];
  more: boolean;
};
export function sessionsChanged() {
  window.dispatchEvent(new Event("console:sessions-changed"));
}
export function useProjectSessions(deviceId: string, projectId: string) {
  const { connected, origin, request } = useMachineProjects(deviceId);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    sessions?: Session[];
    error?: string;
  }>();
  const key = `${connected ? origin : ""}:${projectId}:${revision}`;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await request<{ sessions: SessionRecord[] }>(
          `/v1/projects/${projectId}/sessions`,
          { signal: controller.signal },
        );
        const sessions = await Promise.all(
          data.sessions.map((session) =>
            request<Session>(
              `/v1/sessions/${session.sessionId}/conversations`,
              { signal: controller.signal },
            ),
          ),
        );
        if (!controller.signal.aborted) setSnapshot({ key, sessions });
      } catch (cause) {
        if (!controller.signal.aborted)
          setSnapshot({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load sessions.",
          });
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    };
    void load();
    window.addEventListener("console:sessions-changed", refresh);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("console:sessions-changed", refresh);
    };
  }, [connected, key, projectId, request, refresh]);
  return {
    ...(snapshot?.key === key ? snapshot : {}),
    connected,
    request,
    refresh,
    revision,
  };
}

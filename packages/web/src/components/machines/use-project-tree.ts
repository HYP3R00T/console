"use client";
import { useEffect, useState } from "react";
import {
  api,
  type ConversationSummary,
  type SessionSummary,
  type Workspace,
} from "@/lib/api";
export function useProjectTree(machineId: string) {
  const [data, setData] = useState<{
    projects: Workspace[];
    sessions: SessionSummary[];
    conversations: Record<string, ConversationSummary[]>;
  }>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = () => {
    setRevision((value) => value + 1);
    window.dispatchEvent(new Event("console:tree-changed"));
  };
  useEffect(() => {
    void revision; // Re-fetch immediately after a tree mutation.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [projects, sessions] = await Promise.all([
          api<Workspace[]>(
            "/workspaces",
            "GET",
            undefined,
            controller.signal,
            machineId,
          ),
          api<SessionSummary[]>(
            "/sessions",
            "GET",
            undefined,
            controller.signal,
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
                  await api<ConversationSummary[]>(
                    `/sessions/${session.id}/conversations`,
                    "GET",
                    undefined,
                    controller.signal,
                    machineId,
                  ),
                ] as const,
            ),
        );
        if (!controller.signal.aborted) {
          setData({
            projects,
            sessions,
            conversations: Object.fromEntries(entries),
          });
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("Offline · saved information may be stale");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [machineId, revision]);
  return { data, error, refresh };
}

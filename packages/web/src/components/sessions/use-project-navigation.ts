"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  type SessionRecord,
  sessionsChanged,
  useProjectSessions,
} from "./use-project-sessions";
export function useProjectNavigation(
  deviceId: string,
  projectId: string,
  available: boolean,
  enabled = true,
  onCreated?: () => void,
) {
  const state = useProjectSessions(deviceId, projectId, enabled);
  const router = useRouter();
  const href = `/devices/${encodeURIComponent(deviceId)}/projects/${encodeURIComponent(projectId)}`;
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function create(kind: "conversation" | "session", target?: string) {
    if (pending.current || busy || !state.connected || !available) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (kind === "session") {
        await state.request<SessionRecord>(
          `/v1/projects/${projectId}/sessions`,
          { method: "POST", body: "{}" },
        );
        sessionsChanged();
        if (active.current) onCreated?.();
        return;
      }
      onCreated?.();
      router.push(
        target
          ? `${href}/sessions/${target}/conversations/new`
          : `${href}/conversations/new`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create conversation.",
      );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { state, create, busy, error };
}

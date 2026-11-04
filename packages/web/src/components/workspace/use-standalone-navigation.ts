"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMachineProjects } from "@/components/projects/projects-provider";
import type { SessionRecord } from "@/components/sessions/use-project-sessions";
import { sessionsChanged } from "@/components/sessions/use-project-sessions";

type StandaloneRecord = SessionRecord & { conversationId: number };

export function useStandaloneNavigation(
  deviceId: string,
  closeMobile: () => void,
) {
  const { connected, origin, client, request } = useMachineProjects(deviceId);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    client: typeof client;
    sessions?: StandaloneRecord[];
    error?: string;
  }>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const router = useRouter();
  const base = `/devices/${encodeURIComponent(deviceId)}/conversations`;
  const key = origin ?? "";
  useEffect(() => {
    if (!connected) return;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function load() {
      clearTimeout(timer);
      controller?.abort();
      const operation = new AbortController();
      controller = operation;
      try {
        const data = await request<{ sessions: StandaloneRecord[] }>(
          "/v1/standalone",
          { signal: operation.signal },
        );
        if (!operation.signal.aborted)
          setSnapshot({ key, client, sessions: data.sessions });
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
                : "Could not load Recents.",
          }));
      } finally {
        if (!stopped && !operation.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    }
    void load();
    window.addEventListener("console:sessions-changed", load);
    return () => {
      stopped = true;
      window.removeEventListener("console:sessions-changed", load);
      controller?.abort();
      clearTimeout(timer);
    };
  }, [connected, key, client, request]);
  async function create() {
    if (!connected || pending.current) return;
    pending.current = true;
    setCreating(true);
    setError(undefined);
    try {
      const session = await request<SessionRecord>("/v1/standalone", {
        method: "POST",
        body: "{}",
      });
      sessionsChanged();
      closeMobile();
      router.push(`${base}/${session.sessionId}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create conversation.",
      );
    } finally {
      pending.current = false;
      setCreating(false);
    }
  }
  const current =
    connected && snapshot?.key === key && snapshot.client === client
      ? snapshot
      : undefined;
  return {
    sessions: current?.sessions,
    error: error ?? current?.error,
    creating,
    create,
    connected,
    base,
  };
}

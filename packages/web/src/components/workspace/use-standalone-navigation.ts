"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMachineProjects } from "@/components/projects/projects-provider";
import type { SessionRecord } from "@/components/sessions/use-project-sessions";

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
  function create() {
    if (!connected) return;
    closeMobile();
    router.push(`${base}/new`);
  }
  const current =
    connected && snapshot?.key === key && snapshot.client === client
      ? snapshot
      : undefined;
  return {
    sessions: current?.sessions,
    error: current?.error,
    creating: false,
    create,
    connected,
    base,
  };
}

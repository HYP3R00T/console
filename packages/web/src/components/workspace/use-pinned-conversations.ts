"use client";
import { useEffect, useState } from "react";
import { useMachineProjects } from "@/components/projects/projects-provider";
import type { Session } from "@/components/sessions/use-project-sessions";
import { conversationKey } from "@/lib/conversation-pins";

/** Resolve pins independently of whether the owning project disclosure is mounted. */
export function usePinnedConversations(deviceId: string, pins: string[]) {
  const { connected, client, request } = useMachineProjects(deviceId);
  const key = JSON.stringify(pins);
  const [snapshot, setSnapshot] = useState<{
    client: typeof client;
    key: string;
    sessions: Session[];
  }>();
  useEffect(() => {
    if (!connected || !pins.length) return;
    let controller: AbortController;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const load = async () => {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const ids = [
        ...new Set(
          (JSON.parse(key) as string[]).map((pin) => pin.split(":")[0]),
        ),
      ];
      const results = await Promise.allSettled(
        ids.map((id) =>
          request<Session>(`/v1/sessions/${id}/conversations`, { signal }),
        ),
      );
      if (stopped || signal.aborted) return;
      setSnapshot({
        client,
        key,
        sessions: results.flatMap((r) =>
          r.status === "fulfilled" ? [r.value] : [],
        ),
      });
      timer = setTimeout(() => void load(), 10000);
    };
    void load();
    window.addEventListener("console:sessions-changed", load);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(timer);
      window.removeEventListener("console:sessions-changed", load);
    };
  }, [connected, client, request, key, pins.length]);
  const sessions =
    connected && snapshot && snapshot.client === client
      ? snapshot.sessions
      : [];
  return pins.map((pin) => {
    for (const { session, conversations } of sessions) {
      const conversation = conversations.find(
        (c) => conversationKey(session.sessionId, c.id) === pin,
      );
      if (conversation) return { key: pin, session, conversation };
    }
    return {
      key: pin,
      loading:
        connected &&
        (!snapshot || snapshot.client !== client || snapshot.key !== key),
    };
  });
}

"use client";
import { useEffect, useState } from "react";
export type ChatMessage = {
  id: string;
  entryId: number;
  role: "user" | "assistant";
  text: string;
  failed: boolean;
};
export type ChatSnapshot = {
  id: number;
  messages: ChatMessage[];
  busy: boolean;
  partial: string;
  queued: number;
  hasEarlier: boolean;
  thinkingLevel?: string;
  model?: { provider: string; modelId: string };
};
export function useConversation(origin: string | undefined, path: string) {
  const key = `${origin}:${path}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data?: ChatSnapshot;
    status: string;
  }>();
  useEffect(() => {
    if (!origin) return;
    const events = new EventSource(`${origin}${path}/events`);
    setSnapshot({ key, status: "Connecting…" });
    events.addEventListener("snapshot", (event) => {
      try {
        const data: ChatSnapshot = JSON.parse(event.data);
        if (!Array.isArray(data.messages) || typeof data.busy !== "boolean")
          throw new Error();
        setSnapshot({ key, data, status: "Live" });
      } catch {
        events.close();
        setSnapshot({ key, status: "Invalid conversation update." });
      }
    });
    events.onerror = () =>
      setSnapshot((previous) => ({
        key,
        data: previous?.key === key ? previous.data : undefined,
        status: "Reconnecting…",
      }));
    return () => events.close();
  }, [origin, path, key]);
  return snapshot?.key === key ? snapshot : undefined;
}

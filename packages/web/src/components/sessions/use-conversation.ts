"use client";
import { useEffect, useState } from "react";
import type { BackendClient } from "@/lib/backend/client";
export type ChatMessage = {
  id: string;
  entryId: number;
  role: "user" | "assistant" | "tool";
  text: string;
  failed: boolean;
  toolName?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
};
export type ChatSnapshot = {
  id: number;
  messages: ChatMessage[];
  busy: boolean;
  partial: string;
  activeTools?: { name: string; status: string }[];
  queued: number;
  hasEarlier: boolean;
  thinkingLevel?: string;
  model?: { provider: string; modelId: string };
};
export function useConversation(
  client: BackendClient | undefined,
  path: string,
) {
  const key = `${client?.origin}:${path}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    client: BackendClient;
    data?: ChatSnapshot;
    status: string;
  }>();
  useEffect(() => {
    if (!client) return;
    setSnapshot({ key, client, status: "Connecting…" });
    const close = client.subscribe(`${path}/events`, "snapshot", {
      message: (message) => {
        try {
          const data: ChatSnapshot = JSON.parse(message);
          if (!Array.isArray(data.messages) || typeof data.busy !== "boolean")
            throw new Error();
          setSnapshot({ key, client, data, status: "Live" });
        } catch {
          close();
          setSnapshot({ key, client, status: "Invalid conversation update." });
        }
      },
      reconnecting: () =>
        setSnapshot((previous) => ({
          key,
          client,
          data:
            previous?.key === key && previous.client === client
              ? previous.data
              : undefined,
          status: "Reconnecting…",
        })),
    });
    return close;
  }, [client, path, key]);
  return snapshot?.key === key && snapshot.client === client
    ? snapshot
    : undefined;
}

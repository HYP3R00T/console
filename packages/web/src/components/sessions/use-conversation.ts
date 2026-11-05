"use client";
import { startTransition, useEffect, useState } from "react";
import type { BackendClient } from "@/lib/backend/client";
import {
  ConversationFeed,
  type ConversationFeedState,
} from "./conversation-feed";

export type {
  ChatMessage,
  ChatSnapshot,
  QueuedInput,
} from "./conversation-state";

export function useConversation(
  client: BackendClient | undefined,
  path: string,
) {
  const key = `${client?.origin}:${path}`;
  const [snapshot, setSnapshot] = useState<
    ConversationFeedState & {
      key: string;
      client: BackendClient;
      loadHistory: (before: number) => Promise<void>;
    }
  >();
  useEffect(() => {
    if (!client) return;
    let loaded = false;
    const feed = new ConversationFeed(client, path, (next) => {
      const reveal = () =>
        setSnapshot({
          ...next,
          key,
          client,
          loadHistory: (before) => feed.loadHistory(before),
        });
      if (!loaded && next.data) startTransition(reveal);
      else reveal();
      if (next.data) loaded = true;
    });
    feed.start();
    return () => feed.close();
  }, [client, path, key]);
  return snapshot?.key === key && snapshot.client === client
    ? snapshot
    : undefined;
}

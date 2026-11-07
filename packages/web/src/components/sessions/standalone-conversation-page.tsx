"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Chat } from "./chat";
import { usePendingConversationInspector } from "./use-pending-conversation-inspector";
import type { Conversation, SessionRecord } from "./use-project-sessions";

export function StandaloneConversationPage() {
  const { deviceId, sessionId, conversationId } = useParams<{
    deviceId: string;
    sessionId: string;
    conversationId?: string;
  }>();
  const { connected, origin } = useMachineProjects(deviceId);
  if (!connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from Manage devices.
      </p>
    );
  return (
    <StandaloneChat
      key={`${origin}:${sessionId}:${conversationId ?? "1"}`}
      deviceId={deviceId}
      sessionId={sessionId}
      conversationId={conversationId}
    />
  );
}

function StandaloneChat({
  deviceId,
  sessionId,
  conversationId,
}: {
  deviceId: string;
  sessionId: string;
  conversationId?: string;
}) {
  const { request, device } = useMachineProjects(deviceId);
  const [data, setData] = useState<{
    session: SessionRecord;
    conversationId: number;
    parent?: { conversationId: number; at: number };
    conversations: Conversation[];
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let pending: AbortController;
    const load = () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      setError(undefined);
      void request<NonNullable<typeof data>>(
        `/v1/standalone/${encodeURIComponent(sessionId)}${conversationId ? `/${encodeURIComponent(conversationId)}` : ""}`,
        { signal: controller.signal },
      )
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not load conversation.",
            );
        });
    };
    load();
    window.addEventListener("console:sessions-changed", load);
    return () => {
      pending.abort();
      window.removeEventListener("console:sessions-changed", load);
    };
  }, [request, sessionId, conversationId]);
  usePendingConversationInspector(!data && !error);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!data)
    return (
      <p className="text-sm text-muted-foreground">Loading conversation…</p>
    );
  return (
    <Chat
      deviceId={deviceId}
      sessionId={sessionId}
      conversationId={String(data.conversationId)}
      branches={data.conversations}
      ancestry={
        data.parent && {
          ...data.parent,
          name: data.conversations.find(
            (item) => item.id === data.parent?.conversationId,
          )?.name,
        }
      }
      title={data.session.name}
      subtitle={`${device?.name ?? "Machine"} / Outside projects`}
    />
  );
}

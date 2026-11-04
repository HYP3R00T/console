"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Chat } from "./chat";
import type { SessionRecord } from "./use-project-sessions";

export function StandaloneConversationPage() {
  const { deviceId, sessionId } = useParams<{
    deviceId: string;
    sessionId: string;
  }>();
  const { connected, origin } = useMachineProjects(deviceId);
  if (!connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from the first column.
      </p>
    );
  return (
    <StandaloneChat
      key={`${origin}:${sessionId}`}
      deviceId={deviceId}
      sessionId={sessionId}
    />
  );
}

function StandaloneChat({
  deviceId,
  sessionId,
}: {
  deviceId: string;
  sessionId: string;
}) {
  const { request } = useMachineProjects(deviceId);
  const [data, setData] = useState<{
    session: SessionRecord;
    conversationId: number;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void request<{ session: SessionRecord; conversationId: number }>(
      `/v1/standalone/${encodeURIComponent(sessionId)}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load conversation.",
          );
      });
    return () => controller.abort();
  }, [request, sessionId]);
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
      title={data.session.name}
      subtitle="Outside projects"
    />
  );
}

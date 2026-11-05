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
        Connect this machine from Manage devices.
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
  const { request, device } = useMachineProjects(deviceId);
  const [data, setData] = useState<{
    session: SessionRecord;
    conversationId: number;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let pending: AbortController;
    const load = () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      setError(undefined);
      void request<{ session: SessionRecord; conversationId: number }>(
        `/v1/standalone/${encodeURIComponent(sessionId)}`,
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
      subtitle={`${device?.name ?? "Machine"} / Outside projects`}
    />
  );
}

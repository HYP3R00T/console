"use client";

import { useParams } from "next/navigation";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Chat } from "./chat";
import { useProjectSessions } from "./use-project-sessions";

export function ConversationPage() {
  const params = useParams<{
    deviceId: string;
    projectId: string;
    sessionId: string;
    conversationId: string;
  }>();
  const state = useMachineProjects(params.deviceId);
  const project = state.projects?.find((p) => p.id === params.projectId);
  if (!state.connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from Manage devices.
      </p>
    );
  if (!project)
    return (
      <p className="text-sm text-muted-foreground">
        {state.projects ? "Project not found." : "Loading project…"}
      </p>
    );
  return <ProjectChat {...params} />;
}
function ProjectChat({
  deviceId,
  projectId,
  sessionId,
  conversationId,
}: {
  deviceId: string;
  projectId: string;
  sessionId: string;
  conversationId: string;
}) {
  const { origin } = useMachineProjects(deviceId);
  const sessions = useProjectSessions(deviceId, projectId);
  const session = sessions.sessions?.find(
    (item) => item.session.sessionId === sessionId,
  );
  const matched = session?.conversations.find(
    (item) => item.id === Number(conversationId),
  );
  if (sessions.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {sessions.error}
      </p>
    );
  if (!sessions.sessions)
    return <p className="text-sm text-muted-foreground">Loading session…</p>;
  if (!matched || !session)
    return (
      <p role="alert" className="text-sm text-destructive">
        Conversation not found in this project.
      </p>
    );
  return (
    <Chat
      key={`${origin}:${sessionId}:${conversationId}`}
      deviceId={deviceId}
      sessionId={sessionId}
      conversationId={conversationId}
      title={matched.name}
      subtitle={`Session ${session.session.number}`}
    />
  );
}

"use client";

import { useParams } from "next/navigation";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Chat } from "./chat";
import { DraftConversationPage } from "./draft-conversation-page";
import { usePendingConversationInspector } from "./use-pending-conversation-inspector";
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
  usePendingConversationInspector(
    state.connected && !state.projects && params.conversationId !== "new",
  );
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
  if (params.conversationId === "new") return <DraftConversationPage />;
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
  const { origin, device, projects } = useMachineProjects(deviceId);
  const project = projects?.find((item) => item.id === projectId);
  const sessions = useProjectSessions(deviceId, projectId);
  const session = sessions.sessions?.find(
    (item) => item.session.sessionId === sessionId,
  );
  const matched = session?.conversations.find(
    (item) => item.id === Number(conversationId),
  );
  usePendingConversationInspector(!sessions.sessions && !sessions.error);
  if (sessions.error && !sessions.sessions)
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
      subtitle={`${device?.name ?? "Machine"} / ${project?.name ?? "Project"}${sessions.sessions.length > 1 ? ` / Session ${session.session.number}` : ""}`}
    />
  );
}

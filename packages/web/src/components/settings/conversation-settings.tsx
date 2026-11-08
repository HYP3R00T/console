"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useRegisterCommands } from "@/components/commands/command-registry";
import { ConversationCommands } from "@/components/commands/conversation-commands";
import { ConversationInspector } from "@/components/sessions/conversation-inspector";
import { useConversation } from "@/components/sessions/use-conversation";
import type { Session } from "@/components/sessions/use-project-sessions";
import { useBackendRequest } from "@/hooks/use-backend-request";
import { executeBackendCommand } from "@/lib/backend/commands";

export function ConversationSettings() {
  const { deviceId, sessionId, conversationId } = useParams<{
    deviceId: string;
    sessionId: string;
    conversationId: string;
  }>();
  const { client, request } = useBackendRequest();
  const path = `/v1/sessions/${encodeURIComponent(sessionId)}/conversations/${encodeURIComponent(conversationId)}`;
  const feed = useConversation(client, path);
  const [session, setSession] = useState<{
    client: typeof client;
    sessionId: string;
    projectId: string;
  }>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    void request<Session>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/conversations`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setSession({
            client,
            sessionId,
            projectId: result.session.projectId,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Could not load session.",
          );
      });
    return () => controller.abort();
  }, [client, request, sessionId]);
  const target = { sessionId, conversationId };
  async function run(
    id: "conversation.stop" | "conversation.continue",
    input: unknown,
  ) {
    setPending(true);
    setError(undefined);
    try {
      return await executeBackendCommand({ request }, id, target, input);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Command failed.");
      throw error;
    } finally {
      setPending(false);
    }
  }
  useRegisterCommands({
    "conversation.configure": {
      disabled: !client ? "Connect this machine first." : undefined,
      run: (input) =>
        input === undefined
          ? undefined
          : executeBackendCommand(
              { request },
              "conversation.configure",
              target,
              input,
            ),
    },
  });
  const execution = feed?.data?.execution,
    working = !!feed?.data?.busy || !!feed?.data?.queued;
  const owner =
    session && session.client === client && session.sessionId === sessionId
      ? session
      : undefined;
  const projectId = owner?.projectId;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header>
        <h1 className="text-xl font-semibold">Conversation settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Applies to this conversation. Shared machine, project and session
          settings link to their owning section.
        </p>
      </header>
      {!client ? (
        <p>Connect this machine first.</p>
      ) : !owner ? (
        <p role="status">Loading conversation ownership…</p>
      ) : (
        <>
          <ConversationCommands
            key={`${deviceId}:${path}`}
            request={request}
            sessionId={sessionId}
            conversationId={conversationId}
            working={working || !!execution?.compactions.length}
            pending={pending}
            canContinue={
              !!execution?.failure?.canContinue && execution.state === "idle"
            }
            modelAvailable={!!feed?.data?.model}
            stop={() => run("conversation.stop", {})}
            continueRun={() =>
              run("conversation.continue", {
                failedTaskId: execution?.failure?.taskId,
              })
            }
          />
          <div className="min-h-96 flex-1">
            <ConversationInspector
              key={`${deviceId}:${path}`}
              path={path}
              request={request}
              working={working}
              execution={execution}
              savedModel={feed?.data?.model}
              projectId={projectId}
            />
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

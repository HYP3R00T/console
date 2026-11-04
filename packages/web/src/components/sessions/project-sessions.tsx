"use client";
import { Layers, SquarePen } from "lucide-react";
import { NavigationMenu } from "@/components/layout/navigation-menu";
import { NavigationRow } from "@/components/layout/navigation-row";
import { Button } from "@/components/ui/button";
import { conversationKey, orderConversations } from "@/lib/conversation-pins";
import { useConversationPins } from "./conversation-preferences";
import { ConversationRow } from "./conversation-row";
import type { Session } from "./use-project-sessions";

export function ProjectSessions({
  deviceId,
  projectId,
  sessions,
  busy,
  createConversation,
  closeMobile = () => {},
}: {
  deviceId: string;
  projectId: string;
  sessions?: Session[];
  busy: boolean;
  createConversation: (sessionId: string) => void;
  closeMobile?: () => void;
}) {
  const { pins } = useConversationPins();
  if (!sessions)
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Loading conversations…
      </p>
    );
  const grouped = sessions.length > 1;
  return (
    <div className="space-y-2 pl-4">
      {sessions.map(({ session, conversations, more }) => (
        <section
          key={session.sessionId}
          aria-label={
            grouped ? `Session ${session.number}` : "Project conversations"
          }
          className={grouped ? "bg-muted/20" : undefined}
        >
          {grouped && (
            <NavigationMenu
              label={`Session ${session.number} actions`}
              actions={[
                {
                  label: "New conversation",
                  icon: SquarePen,
                  disabled: busy,
                  onSelect: () => createConversation(session.sessionId),
                },
              ]}
            >
              {(menu) => (
                <NavigationRow
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busy}
                        aria-label={`New conversation in Session ${session.number}`}
                        title="New conversation"
                        onClick={() => createConversation(session.sessionId)}
                      >
                        <SquarePen className="size-4" />
                      </Button>
                      {menu}
                    </>
                  }
                >
                  <h4 className="flex h-9 items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                    <Layers className="size-4" />
                    Session {session.number}
                  </h4>
                </NavigationRow>
              )}
            </NavigationMenu>
          )}
          <div className={grouped ? "pl-3" : undefined}>
            {orderConversations(
              conversations,
              (conversation) =>
                conversationKey(session.sessionId, conversation.id),
              pins,
            ).map((conversation) => (
              <ConversationRow
                key={conversation.id}
                sessionId={session.sessionId}
                conversation={conversation}
                href={`/devices/${deviceId}/projects/${projectId}/sessions/${session.sessionId}/conversations/${conversation.id}`}
                closeMobile={closeMobile}
              />
            ))}
            {more && (
              <p className="px-2 text-xs text-muted-foreground">
                Only the first 200 conversations are listed.
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

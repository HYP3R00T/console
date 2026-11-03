"use client";
import { ChevronRight, Layers, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { sessionsChanged, useProjectSessions } from "./use-project-sessions";
export function ProjectSessions({
  deviceId,
  projectId,
  compact = false,
  closeMobile = () => {},
}: {
  deviceId: string;
  projectId: string;
  compact?: boolean;
  closeMobile?: () => void;
}) {
  const state = useProjectSessions(deviceId, projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pathname = usePathname();
  const router = useRouter();
  const href = (sessionId: string, id: number) =>
    `/devices/${deviceId}/projects/${projectId}/sessions/${sessionId}/conversations/${id}`;
  async function createConversation(sessionId: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await state.request<{ id: number }>(
        `/v1/sessions/${sessionId}/conversations`,
        { method: "POST", body: "{}" },
      );
      sessionsChanged();
      closeMobile();
      router.push(href(sessionId, created.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create conversation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cn("space-y-1", compact && "pl-4")}>
      {(error || state.error) && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error ?? state.error}
        </p>
      )}
      {!state.sessions && !state.error && (
        <p className="px-2 py-2 text-xs text-muted-foreground">
          Loading sessions…
        </p>
      )}
      {state.sessions?.map(({ session, conversations, more }) => (
        <Collapsible key={session.id} defaultOpen>
          <ContextMenu>
            <ContextMenuTrigger className="flex min-w-0 flex-col">
              <div className="flex items-center">
                <CollapsibleTrigger
                  className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-sm hover:bg-sidebar-accent [&[aria-expanded=true]>svg:first-child]:rotate-90"
                  title={session.number === 1 ? "Default session" : undefined}
                >
                  <ChevronRight className="size-3 shrink-0" />
                  <Layers className="size-4 shrink-0" />
                  <span className="truncate">Session {session.number}</span>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`New conversation in Session ${session.number}`}
                  title="New conversation"
                  disabled={busy}
                  onClick={() => void createConversation(session.sessionId)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                disabled={busy}
                onClick={() => void createConversation(session.sessionId)}
              >
                <MessageSquare />
                New conversation
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <CollapsibleContent className="pl-4">
            {conversations.map((conversation) => (
              <Button
                key={conversation.id}
                variant="ghost"
                className={cn(
                  "flex w-full justify-start",
                  pathname === href(session.sessionId, conversation.id) &&
                    "bg-sidebar-accent",
                )}
                nativeButton={false}
                render={
                  <Link
                    href={href(session.sessionId, conversation.id)}
                    onClick={closeMobile}
                  />
                }
                aria-current={
                  pathname === href(session.sessionId, conversation.id)
                    ? "page"
                    : undefined
                }
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="truncate">{conversation.name}</span>
              </Button>
            ))}
            {more && (
              <p className="text-xs text-muted-foreground">
                Only the first 200 conversations are listed.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}

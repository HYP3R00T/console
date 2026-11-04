"use client";

import { SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { useConversationPins } from "@/components/sessions/conversation-preferences";
import { ConversationRow } from "@/components/sessions/conversation-row";
import type { SessionRecord } from "@/components/sessions/use-project-sessions";
import { sessionsChanged } from "@/components/sessions/use-project-sessions";
import { conversationKey, orderConversations } from "@/lib/conversation-pins";
import { cn } from "@/lib/utils";

type StandaloneRecord = SessionRecord & { conversationId: number };

export function StandaloneNavigation({
  deviceId,
  closeMobile,
  compact = false,
  children,
}: {
  deviceId: string;
  closeMobile: () => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { connected, origin, request } = useMachineProjects(deviceId);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    sessions?: StandaloneRecord[];
    error?: string;
  }>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const router = useRouter();
  const preferences = useConversationPins();
  const base = `/devices/${encodeURIComponent(deviceId)}/conversations`;
  const key = `${origin}:${revision}`;
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await request<{ sessions: StandaloneRecord[] }>(
          "/v1/standalone",
          { signal: controller.signal },
        );
        if (!controller.signal.aborted)
          setSnapshot({ key, sessions: data.sessions });
      } catch (cause) {
        if (!controller.signal.aborted)
          setSnapshot({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load Recents.",
          });
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    }
    void load();
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("console:sessions-changed", refresh);
    return () => {
      window.removeEventListener("console:sessions-changed", refresh);
      controller.abort();
      clearTimeout(timer);
    };
  }, [connected, key, request]);
  async function create() {
    if (!connected || creating) return;
    setCreating(true);
    setError(undefined);
    try {
      const session = await request<SessionRecord>("/v1/standalone", {
        method: "POST",
        body: "{}",
      });
      sessionsChanged();
      closeMobile();
      router.push(`${base}/${session.sessionId}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create conversation.",
      );
    } finally {
      setCreating(false);
    }
  }
  const current = connected && snapshot?.key === key ? snapshot : undefined;
  return (
    <>
      <SidebarAction
        compact={compact}
        aria-label="New conversation"
        title="New conversation outside a project"
        disabled={!connected || creating}
        onClick={() => void create()}
      >
        <SquarePen />
        {!compact && <span>{creating ? "Creating…" : "New conversation"}</span>}
      </SidebarAction>
      {children}
      <section
        aria-label="Recents"
        className={cn(compact && "flex flex-col gap-2")}
      >
        {!compact && (
          <h3 className="mb-2 px-3 text-xs font-medium text-muted-foreground">
            Recents
          </h3>
        )}
        {(error || current?.error) && (
          <p
            role="alert"
            className={compact ? "sr-only" : "px-3 text-xs text-destructive"}
          >
            {error ?? current?.error}
          </p>
        )}
        {!compact && !current?.error && !current?.sessions?.length && (
          <p className="px-3 text-xs text-muted-foreground">
            {!connected
              ? "Connect this machine to see Recents."
              : current?.sessions
                ? "No conversations yet."
                : "Loading conversations…"}
          </p>
        )}
        {orderConversations(
          current?.sessions ?? [],
          (session) =>
            conversationKey(session.sessionId, session.conversationId),
          preferences.pins,
        ).map((session) => (
          <ConversationRow
            key={session.sessionId}
            sessionId={session.sessionId}
            conversation={{ id: session.conversationId, name: session.name }}
            href={`${base}/${session.sessionId}`}
            compact={compact}
            closeMobile={closeMobile}
          />
        ))}
      </section>
    </>
  );
}

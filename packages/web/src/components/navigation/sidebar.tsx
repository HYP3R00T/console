"use client";

import {
  MonitorIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
} from "lucide-react";
import type { ChatSession } from "@/components/chat/use-chat-session";
import type { WorkspaceLayout } from "@/components/chat/use-workspace-layout";
import { NetworkSidebar } from "@/components/navigation/network-sidebar";
import { Trash } from "@/components/navigation/trash";
import { Button } from "@/components/ui/button";
import { api, type ConversationSummary } from "@/lib/api";
export function WorkspaceNavigation({
  chat,
  layout,
}: {
  chat: ChatSession;
  layout: WorkspaceLayout;
}) {
  const { session } = chat;

  return (
    <aside
      id="workspace-navigation"
      aria-label="Workspace navigation"
      className={`flex h-full min-h-0 bg-background ${layout.compact && !layout.navigationOpen ? "flex-row" : "flex-col"}`}
    >
      <div className="flex h-10 shrink-0 items-center border-b px-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 aria-expanded:bg-transparent"
          aria-label={
            layout.navigationOpen ? "Collapse machines" : "Expand machines"
          }
          aria-expanded={layout.navigationOpen}
          onClick={layout.toggleNavigation}
        >
          {layout.navigationOpen ? (
            <PanelLeftCloseIcon />
          ) : (
            <PanelLeftOpenIcon />
          )}
        </Button>
        {layout.navigationOpen && (
          <span className="ml-2 text-xs text-muted-foreground">Machines</span>
        )}
        {layout.navigationOpen && (
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-7"
            aria-label="Add machine"
            onClick={() => window.location.assign("/machines")}
          >
            <PlusIcon />
          </Button>
        )}
      </div>
      {!layout.navigationOpen && (
        <nav
          aria-label="Collapsed machines"
          className={`flex gap-1 overflow-auto p-1 ${layout.compact ? "flex-row" : "flex-col"}`}
        >
          {chat.connections.map((connection) => (
            <Button
              key={connection.id}
              size="icon"
              variant="ghost"
              className={`relative size-7 shrink-0 ${chat.machineId === connection.id ? "bg-accent" : ""}`}
              aria-label={`Open machine ${connection.name}`}
              title={`${connection.name} · ${connection.status}`}
              onClick={() => {
                if (chat.machineId !== connection.id)
                  chat.selectMachine(connection.id);
                layout.setNavigationOpen(true);
              }}
            >
              <MonitorIcon className="size-4" />
              <span
                aria-hidden="true"
                className={`absolute right-1 bottom-1 size-1.5 rounded-full ${connection.status === "online" ? "bg-green-500" : "bg-muted-foreground"}`}
              />
            </Button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label="Add machine"
            title="Add machine"
            onClick={() => window.location.assign("/machines")}
          >
            <PlusIcon />
          </Button>
        </nav>
      )}
      <div
        className={
          layout.navigationOpen ? "flex h-full min-h-0 flex-col" : "hidden"
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NetworkSidebar
            selected={chat.selected}
            creating={chat.creating || chat.working}
            conversationId={session?.conversationId}
            onSelect={(id, cid) => {
              layout.setContextPanel("");
              if (id !== chat.selected) chat.select(id);
              if (cid) chat.chooseConversation(cid);
            }}
            onNew={(id) => {
              chat.setWorkspaceId(id);
              chat.setCreating(true);
            }}
          />
        </div>
        <Trash
          key={`sessions-${layout.trashRevision}`}
          kind="sessions"
          onRestore={() => {
            window.dispatchEvent(new Event("console:tree-changed"));
          }}
        />
        {session && (
          <Trash
            key={`${session.id}:${layout.trashRevision}`}
            kind="conversations"
            sessionId={session.id}
            onRestore={() => {
              void api<ConversationSummary[]>(
                `/sessions/${session.id}/conversations`,
              ).then(chat.setConversations);
            }}
          />
        )}
      </div>
    </aside>
  );
}

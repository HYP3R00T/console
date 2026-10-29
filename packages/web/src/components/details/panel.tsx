"use client";

import {
  FolderIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MonitorIcon,
  PanelRightCloseIcon,
  PuzzleIcon,
  SettingsIcon,
  WrenchIcon,
} from "lucide-react";
import type { ChatSession } from "@/components/chat/use-chat-session";
import type { WorkspaceLayout } from "@/components/chat/use-workspace-layout";
import { AgentPanels } from "@/components/details/agent-panels";
import { SessionInspector } from "@/components/details/overview";
import { ProjectInspector } from "@/components/projects/inspector";
import { Button } from "@/components/ui/button";

const inspectorTabs = [
  { id: "session", label: "Overview", icon: MessageSquareIcon },
  { id: "tasks", label: "Activity", icon: ListTodoIcon },
  { id: "tools", label: "Tools", icon: WrenchIcon },
  { id: "extend", label: "Instructions", icon: PuzzleIcon },
] as const;

export function DetailsPanel({
  chat,
  layout,
}: {
  chat: ChatSession;
  layout: WorkspaceLayout;
}) {
  const { session } = chat;

  return (
    <aside
      id="conversation-details"
      aria-label="Details panel"
      className={`${layout.inspectorOpen ? "flex" : "hidden"} h-full min-h-0 flex-col bg-background ${layout.compact ? "absolute inset-y-0 right-0 z-30 w-full max-w-md border-l shadow-lg" : ""}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">
            {layout.contextPanel === "project"
              ? "Project"
              : layout.contextPanel === "machine"
                ? "Machine"
                : "Conversation"}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {layout.contextPanel === "machine"
              ? chat.connections.find((item) => item.id === chat.machineId)
                  ?.name
              : layout.contextPanel === "project"
                ? chat.workspaces.find(
                    (item) => item.id === layout.inspectedProject,
                  )?.name
                : chat.agentName}
          </p>
        </div>
        <Button
          ref={layout.closeControl}
          variant="ghost"
          size="icon-sm"
          aria-label="Close details panel"
          title="Close details"
          onClick={layout.closeInspector}
        >
          <PanelRightCloseIcon />
        </Button>
      </header>
      {!layout.contextPanel && chat.parentName && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">
          {chat.relationship} {chat.parentName}
        </p>
      )}
      <nav
        aria-label="Details scope"
        className="grid shrink-0 grid-cols-3 gap-1 border-b p-2"
      >
        {(
          [
            { id: "", label: "Conversation", icon: MessageSquareIcon },
            {
              id: "project",
              label: "Project",
              icon: FolderIcon,
            },
            { id: "machine", label: "Machine", icon: MonitorIcon },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={layout.contextPanel === id}
            disabled={
              id === "project" &&
              !session?.workspaceId &&
              !layout.inspectedProject
            }
            className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs disabled:opacity-40 ${layout.contextPanel === id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"}`}
            onClick={() => {
              layout.setContextPanel(id);
              if (id === "project" && session?.workspaceId)
                layout.setInspectedProject(session.workspaceId);
              if (id === "" && layout.panel === "state")
                layout.setPanel("session");
            }}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      {!layout.contextPanel && (
        <nav
          aria-label="Conversation sections"
          className="grid shrink-0 grid-cols-4 border-b"
        >
          {inspectorTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={layout.panel === id ? "page" : undefined}
              className={`flex flex-col items-center gap-1 border-b-2 px-1 py-3 text-[11px] ${layout.panel === id ? "border-foreground" : "border-transparent text-muted-foreground hover:bg-accent/60"}`}
              onClick={() => layout.setPanel(id)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div hidden={layout.contextPanel !== "project"}>
          {layout.inspectedProject && (
            <ProjectInspector
              key={layout.inspectedProject}
              id={layout.inspectedProject}
            />
          )}
        </div>
        <div hidden={layout.contextPanel === "project"}>
          <div hidden={layout.contextPanel !== "machine"}>
            <div className="border-b p-4">
              <a
                href="/settings?section=machine"
                className="flex items-center gap-2 text-xs hover:underline"
              >
                <SettingsIcon className="size-3.5" />
                Machine settings and providers
              </a>
            </div>
            {layout.contextPanel === "machine" && (
              <AgentPanels
                path={
                  session
                    ? chat.conversationPath(session.id, session.conversationId)
                    : ""
                }
                active={layout.inspectorOpen}
                panel="state"
                idle={false}
                onChanged={() => {}}
              />
            )}
          </div>
          {session ? (
            <div hidden={layout.contextPanel === "machine"}>
              <SessionInspector
                active={layout.inspectorOpen && !layout.contextPanel}
                key={`${session.id}:${session.conversationId}`}
                session={session}
                panel={layout.panel}
                disabled={
                  chat.working ||
                  !chat.online ||
                  !chat.detailOnline ||
                  session.status !== "idle"
                }
                onResourcePrompt={(text) => {
                  chat.setDrafts((items) => ({
                    ...items,
                    [chat.draftKey]: text,
                  }));
                  document.getElementById("message")?.focus();
                }}
              />
              <div
                hidden={layout.panel === "session" || layout.panel === "state"}
              >
                <AgentPanels
                  key={`${session.id}:${session.conversationId}`}
                  path={chat.conversationPath(
                    session.id,
                    session.conversationId,
                  )}
                  active={layout.inspectorOpen && !layout.contextPanel}
                  panel={layout.panel}
                  idle={
                    session.status === "idle" &&
                    chat.online &&
                    chat.detailOnline &&
                    !chat.working
                  }
                  onChanged={() =>
                    void chat.operate(session.id, async () => {})
                  }
                />
              </div>
            </div>
          ) : (
            <p className="p-4 text-xs text-muted-foreground">
              Select a conversation.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

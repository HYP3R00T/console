"use client";

import { ArrowLeftIcon, FolderIcon, SettingsIcon, XIcon } from "lucide-react";
import Link from "next/link";
import type { ChatSession } from "@/components/chat/use-chat-session";
import type { WorkspaceLayout } from "@/components/chat/use-workspace-layout";
import { AgentPanels } from "@/components/details/agent-panels";
import { SessionInspector } from "@/components/details/overview";
import { ProjectInspector } from "@/components/projects/inspector";
import { Button } from "@/components/ui/button";

export function DetailsPanel({
  chat,
  layout,
}: {
  chat: ChatSession;
  layout: WorkspaceLayout;
}) {
  const { session } = chat;
  const projectView = layout.contextPanel === "project";
  const project = chat.workspaces.find(
    (item) =>
      item.id ===
      (projectView ? layout.inspectedProject : session?.workspaceId),
  );
  const modelName = chat.providers
    .find((item) => item.id === session?.model?.provider)
    ?.models.find((item) => item.id === session?.model?.modelId)?.name;
  return (
    <aside
      id="conversation-details"
      aria-label="Details panel"
      className={`${layout.inspectorOpen ? "flex" : "hidden"} h-full min-h-0 flex-col bg-background ${layout.compact ? "absolute inset-y-0 right-0 z-30 w-full max-w-md border-l shadow-lg" : ""}`}
    >
      <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
        {projectView && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="Back to conversation details"
            onClick={() => layout.setContextPanel("")}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">
            {projectView ? "Project settings" : "Conversation details"}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {projectView ? project?.name : chat.agentName}
          </p>
        </div>
        <Button
          ref={layout.closeControl}
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Close details panel"
          onClick={layout.closeInspector}
        >
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div hidden={!projectView}>
          {layout.inspectedProject && (
            <ProjectInspector
              key={layout.inspectedProject}
              id={layout.inspectedProject}
              active={layout.inspectorOpen && projectView}
            />
          )}
        </div>
        <div hidden={projectView}>
          {session ? (
            <>
              {chat.parentName && (
                <p className="px-4 pt-4 text-xs text-muted-foreground">
                  {chat.relationship} {chat.parentName}
                </p>
              )}
              <SessionInspector
                key={`${session.id}:${session.conversationId}:summary`}
                session={session}
                modelName={modelName}
                disabled={
                  chat.working ||
                  !chat.online ||
                  !chat.detailOnline ||
                  session.status !== "idle"
                }
              />
              <AgentPanels
                key={`${session.id}:${session.conversationId}`}
                session={session}
                path={chat.conversationPath(session.id, session.conversationId)}
                panel={layout.panel}
                onPanelChange={layout.setPanel}
                active={layout.inspectorOpen && !projectView}
                idle={
                  session.status === "idle" &&
                  chat.online &&
                  chat.detailOnline &&
                  !chat.working
                }
                onChanged={() => void chat.operate(session.id, async () => {})}
                onResourcePrompt={(text) => {
                  chat.setDrafts((items) => ({
                    ...items,
                    [chat.draftKey]: text,
                  }));
                  document.getElementById("message")?.focus();
                }}
              />
            </>
          ) : (
            <p className="p-4 text-xs text-muted-foreground">
              Select a conversation.
            </p>
          )}
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
        {!projectView && session?.workspaceId && (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
            onClick={() => {
              layout.setInspectedProject(session.workspaceId ?? "");
              layout.setContextPanel("project");
            }}
          >
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              {project?.name ?? "Project"} settings
            </span>
          </button>
        )}
        <Link
          href="/settings?section=machine"
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <SettingsIcon className="size-3.5" />
          Machine settings
        </Link>
      </footer>
    </aside>
  );
}

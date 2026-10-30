"use client";

import { PlusIcon, TerminalSquareIcon } from "lucide-react";
import { SessionChat } from "@/components/chat/conversation";
import { ComposerModelPicker } from "@/components/chat/model-picker";
import type { InspectorPanel } from "@/components/details/agent-panels";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

import type { ChatSession } from "./use-chat-session";
import type { WorkspaceLayout } from "./use-workspace-layout";
export function ChatContent({
  chat,
  layout,
}: {
  chat: ChatSession;
  layout: WorkspaceLayout;
}) {
  const { session } = chat;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      aria-busy={chat.opening}
    >
      {session ? (
        <SessionChat
          key={`${session.id}:${session.conversationId}`}
          historyPath={chat.conversationPath(
            session.id,
            session.conversationId,
          )}
          modelPicker={
            <ComposerModelPicker
              value={chat.configuration}
              providers={chat.providers}
              disabled={
                !chat.online ||
                !chat.detailOnline ||
                chat.working ||
                Boolean(chat.pending[chat.draftKey]) ||
                session.status !== "idle"
              }
              onChange={chat.chooseConfiguration}
            />
          }
          onFork={(entryId) => void chat.fork(entryId)}
          onCommand={(command) => {
            if (command === "new") {
              chat.setWorkspaceId(session.workspaceId ?? "");
              chat.setCreating(true);
            } else if (command === "stop" || command === "resume")
              void chat.operate(session.id, async () => {
                await api(
                  `${chat.conversationPath(session.id)}/${command === "stop" ? "cancel" : "resume"}`,
                  "POST",
                );
              });
            else {
              layout.setContextPanel(command === "state" ? "project" : "");
              if (command === "state" && session.workspaceId)
                layout.setInspectedProject(session.workspaceId);
              layout.setPanel(
                command === "config" ? "session" : (command as InspectorPanel),
              );
              layout.setInspectorOpen(true);
            }
          }}
          agentName={chat.agentName}
          projectName={
            chat.workspaces.find((item) => item.id === session.workspaceId)
              ?.name
          }
          inspectorOpen={layout.inspectorOpen}
          onConfigure={() => {
            if (layout.inspectorOpen) layout.closeInspector();
            else {
              layout.setContextPanel("");
              layout.setPanel("session");
              layout.setInspectorOpen(true);
            }
          }}
          session={session}
          machineName={chat.machine?.name}
          online={chat.online && chat.detailOnline}
          working={chat.working}
          configured={Boolean(
            chat.configuration?.model &&
              chat.providers.find(
                (provider) => provider.id === chat.configuration?.provider,
              )?.configured,
          )}
          text={chat.drafts[chat.draftKey] ?? ""}
          uncertain={Boolean(chat.pending[chat.draftKey])}
          onText={(text) =>
            chat.setDrafts((items) => ({ ...items, [chat.draftKey]: text }))
          }
          mode={chat.messageModes[chat.draftKey] ?? "steer"}
          onMode={(mode) =>
            chat.setMessageModes((items) => ({
              ...items,
              [chat.draftKey]: mode,
            }))
          }
          onSend={(mode) => void chat.send(mode)}
          onWithdraw={(id) =>
            void chat.operate(session.id, async () => {
              await api(
                `${chat.conversationPath(session.id)}/submissions/${id}`,
                "DELETE",
              );
            })
          }
          onControl={(action) =>
            void chat.operate(session.id, async () => {
              await api(
                `${chat.conversationPath(session.id)}/${action}`,
                "POST",
              );
            })
          }
        />
      ) : chat.opening ? (
        <section
          role="status"
          className="flex flex-1 flex-col"
          aria-label="Opening conversation"
        >
          <div className="h-16 shrink-0 border-b" />
          <div className="mx-auto mt-8 w-full max-w-3xl space-y-3 px-6">
            <div className="h-3 w-2/3 animate-pulse bg-muted" />
            <div className="h-3 w-1/2 animate-pulse bg-muted" />
          </div>
          <div className="mx-auto mt-auto mb-4 h-32 w-[calc(100%-3rem)] max-w-3xl border bg-muted/20" />
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-none border bg-muted/30 p-4">
            <TerminalSquareIcon className="size-7" aria-hidden="true" />
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Your local agent workspace
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {chat.selected
              ? "Opening conversation…"
              : "A conversation with continuity."}
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {chat.selected
              ? "Loading saved history from this machine."
              : "Choose a project, start a conversation, and give your agent something to work on."}
          </p>
          {!chat.selected && (
            <Button
              variant="outline"
              disabled={!chat.online || chat.working}
              onClick={() => chat.setCreating(true)}
            >
              <PlusIcon data-icon="inline-start" />
              New conversation
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

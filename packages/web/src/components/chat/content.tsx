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
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {session ? (
        <SessionChat
          key={`${session.id}:${session.conversationId}`}
          historyPath={chat.conversationPath(
            session.id,
            session.conversationId,
          )}
          modelPicker={
            <ComposerModelPicker
              session={session}
              providers={chat.providers}
              disabled={
                !chat.online ||
                !chat.detailOnline ||
                chat.working ||
                session.status !== "idle"
              }
              onSave={async (input) => {
                chat.setWorking(true);
                try {
                  await api(
                    `${chat.conversationPath(session.id)}/config`,
                    "PATCH",
                    input,
                  );
                  chat.setSnapshot(
                    await api(chat.conversationPath(session.id)),
                  );
                } finally {
                  chat.setWorking(false);
                }
              }}
            />
          }
          onFork={(entryId) => void chat.fork(entryId)}
          onCommand={(command) => {
            if (command === "new") void chat.newAgent();
            else if (command === "new-session") {
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
              layout.setContextPanel(command === "state" ? "machine" : "");
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
            chat.providers.find(
              (provider) => provider.id === session.model?.provider,
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
              ? "Opening session…"
              : "A conversation with continuity."}
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {chat.selected
              ? "Loading saved history from this machine."
              : "Create a conversation, connect a provider, and give your agent something to work on."}
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

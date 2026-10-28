"use client";

import {
  ChevronRightIcon,
  FolderIcon,
  MessageSquareIcon,
  MonitorIcon,
  TerminalSquareIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChatComposer } from "@/components/chat-composer";
import { MessageReasoning } from "@/components/message-reasoning";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/console-api";

export function SessionChat({
  session,
  machineName,
  projectName,
  agentName,
  onFork,
  onCommand,
  online,
  working,
  dirty,
  configured,
  text,
  uncertain,
  onText,
  onSend,
  onControl,
  onConfigure,
  modelPicker,
}: {
  session: Conversation;
  machineName?: string;
  projectName?: string;
  agentName?: string;
  onFork: (entryId: string) => void;
  onCommand: (command: string) => void;
  online: boolean;
  working: boolean;
  dirty: boolean;
  configured: boolean;
  text: string;
  uncertain: boolean;
  onText: (text: string) => void;
  onSend: () => void;
  onConfigure: () => void;
  modelPicker: ReactNode;
  onControl: (action: "cancel" | "resume") => void;
}) {
  const busy = session.status !== "idle";
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label="Conversation"
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <MonitorIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <Link href="/machines" className="hidden hover:underline sm:inline">
            {machineName || "This machine"}
          </Link>
          {(session.sandbox?.workspace || projectName) && (
            <>
              <ChevronRightIcon
                className="size-3 shrink-0"
                aria-hidden="true"
              />
              <FolderIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <Link
                href="/workspaces"
                className="max-w-32 truncate hover:underline"
                title={session.sandbox.workspace}
              >
                {projectName ||
                  session.sandbox.workspace.split("/").filter(Boolean).at(-1) ||
                  "/"}
              </Link>
            </>
          )}
          <ChevronRightIcon className="size-3 shrink-0" aria-hidden="true" />
          <MessageSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <button
            type="button"
            className="truncate text-left text-sm font-medium text-foreground hover:underline"
            onClick={onConfigure}
            title={session.name}
          >
            {agentName ?? session.name} · #{session.conversationId}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            role="status"
            className="rounded-none border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
          >
            {online ? session.status : "Offline · history may be stale"}
          </span>
          {session.status === "interrupted" && (
            <Button
              variant="outline"
              size="sm"
              disabled={!online || working}
              onClick={() => onControl("resume")}
            >
              Resume
            </Button>
          )}
        </div>
      </header>
      <section
        className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-8 sm:px-6"
        aria-label="Conversation history"
      >
        {!session.messages.length && (
          <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="rounded-none border bg-muted/30 p-4">
              <TerminalSquareIcon className="size-7" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Your session is ready
            </p>
            <h3 className="text-2xl font-semibold tracking-tight">
              A conversation with continuity.
            </h3>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Messages and execution stay on this machine, beyond this window.
              Choose a model, then start with a clear task.
            </p>
            <Button variant="outline" size="sm" onClick={onConfigure}>
              Configure this session
            </Button>
          </div>
        )}
        {session.hasOlder && (
          <p className="text-xs text-muted-foreground">
            Showing the most recent 100 entries. Older history remains saved.
          </p>
        )}
        {session.messages.map(
          (message) =>
            Boolean(message.text || message.reasoning?.length) && (
              <article
                key={message.id}
                className={`mx-auto max-w-3xl space-y-3 ${message.role === "user" ? "flex flex-col items-end py-2" : "py-4"}`}
              >
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {message.role === "user"
                    ? "You"
                    : message.role === "toolResult"
                      ? `Tool · ${message.toolName}`
                      : "Assistant"}
                </h2>
                <MessageReasoning parts={message.reasoning} />
                {message.text && (
                  <p
                    className={`whitespace-pre-wrap wrap-break-word text-sm leading-7 ${message.role === "user" ? "max-w-[90%] rounded-none bg-muted/60 px-4 py-3" : ""}`}
                  >
                    {message.text}
                  </p>
                )}
                {message.entryId && message.role === "assistant" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    disabled={!online || working || busy}
                    onClick={() => onFork(message.entryId ?? "")}
                  >
                    Fork from here
                  </Button>
                )}
              </article>
            ),
        )}
        {(session.partial || !!session.partialReasoning?.length) && (
          <article
            key={session.partialId}
            className="mx-auto max-w-3xl space-y-2 p-4"
          >
            <h2 className="text-xs font-medium text-muted-foreground">
              Assistant · generating
            </h2>
            <MessageReasoning parts={session.partialReasoning} />
            {session.partial && (
              <p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">
                {session.partial}
              </p>
            )}
          </article>
        )}
        {session.outcome &&
          !["done", "placed", "queued"].includes(session.outcome) && (
            <p role="status" className="text-sm text-muted-foreground">
              Last input ended: {session.outcome}
            </p>
          )}
      </section>
      <ChatComposer
        text={text}
        disabled={working || uncertain}
        busy={busy}
        sending={
          working ||
          !online ||
          (!uncertain &&
            (busy || dirty || !configured || !session.model || !text.trim()))
        }
        canCancel={online && !working}
        uncertain={uncertain}
        modelPicker={modelPicker}
        hint={
          uncertain
            ? "Delivery uncertain. Retry uses the same request."
            : dirty
              ? "Save session configuration before sending."
              : !configured || !session.model
                ? "Choose a connected model in Configuration."
                : session.sandbox?.enabled
                  ? "Sandboxed tools · work continues when you close this window"
                  : "No workspace tools · work continues when you close this window"
        }
        onCommand={onCommand}
        onText={onText}
        onSend={onSend}
        onCancel={() => onControl("cancel")}
      />
    </section>
  );
}

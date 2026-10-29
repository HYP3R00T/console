"use client";

import {
  ArrowDownIcon,
  ChevronRightIcon,
  FolderIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  MonitorIcon,
  SlidersHorizontalIcon,
  TerminalSquareIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { ChatActivity, ContextEntry } from "@/components/chat-activity";
import { ChatComposer } from "@/components/chat-composer";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ChatMessage } from "@/components/chat-message";
import { Button } from "@/components/ui/button";
import { useChatHistory } from "@/components/use-chat-history";
import { buildTranscript } from "@/lib/chat-transcript";
import type { Conversation, MessageMode } from "@/lib/console-api";

export function SessionChat({
  session,
  historyPath,
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
  mode,
  onMode,
  onWithdraw,
}: {
  session: Conversation;
  historyPath: string;
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
  onSend: (mode?: MessageMode) => void;
  mode: MessageMode;
  onMode: (mode: MessageMode) => void;
  onWithdraw: (id: string) => void;
  onConfigure: () => void;
  modelPicker: ReactNode;
  onControl: (action: "cancel" | "resume") => void;
}) {
  const history = useChatHistory(session, historyPath);
  const busy = session.status !== "idle";
  const transcript = useMemo(
    () =>
      buildTranscript(
        history.messages,
        session.liveTools,
        session.status === "running",
        session.partialReasoning,
      ),
    [
      history.messages,
      session.liveTools,
      session.status,
      session.partialReasoning,
    ],
  );
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
            {agentName ?? session.name}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Open agent controls"
            title="Agent controls"
            onClick={onConfigure}
          >
            <SlidersHorizontalIcon />
          </Button>
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
        ref={history.viewport}
        style={{ overflowAnchor: "none" }}
        onScroll={history.onScroll}
        onWheel={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(
              "pre, [data-slot=trace-collapsible-content-inner]",
            )
          )
            history.pauseFollowing();
          else history.onWheel(event.deltaY);
        }}
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label="Conversation history"
      >
        <div ref={history.content} className="space-y-6 px-4 py-8 sm:px-6">
          {history.hasOlder && (
            <div className="mx-auto flex max-w-3xl justify-center">
              <Button
                size="sm"
                variant="ghost"
                disabled={history.loading}
                onClick={() => void history.loadOlder()}
              >
                {history.loading
                  ? "Loading earlier messages…"
                  : "Load earlier messages"}
              </Button>
            </div>
          )}
          {history.error && (
            <p
              role="alert"
              className="mx-auto max-w-3xl text-xs text-destructive"
            >
              {history.error}
            </p>
          )}
          {!history.messages.length && (
            <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="rounded-none border bg-muted/30 p-4">
                <TerminalSquareIcon className="size-7" aria-hidden="true" />
              </div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Your conversation is ready
              </p>
              <h3 className="text-2xl font-semibold tracking-tight">
                A conversation with continuity.
              </h3>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                {configured && session.model
                  ? "Send a message to get started."
                  : "Choose a connected model to get started."}
              </p>
              {(!configured || !session.model) && (
                <Button variant="outline" size="sm" onClick={onConfigure}>
                  Choose a model
                </Button>
              )}
            </div>
          )}
          {transcript.map((block) =>
            block.kind === "activity" ? (
              <ChatActivity
                key={block.id}
                block={block}
                running={
                  session.status === "running" &&
                  block.id === transcript.at(-1)?.id
                }
                plan={session.plan}
                onInspect={history.pauseFollowing}
              />
            ) : block.kind === "context" ? (
              <ContextEntry
                key={block.id}
                message={block.message}
                onInspect={history.pauseFollowing}
              />
            ) : (
              <ChatMessage
                key={block.id}
                message={block.message}
                canFork={online && !working && !busy}
                onFork={onFork}
              />
            ),
          )}
          {session.partial && (
            <article
              className="mx-auto max-w-3xl min-w-0"
              aria-label="Assistant response in progress"
            >
              <ChatMarkdown text={session.partial} />
            </article>
          )}
          {session.status === "running" &&
            !session.partial &&
            !session.liveTools?.length &&
            !session.partialReasoning?.length && (
              <div
                role="status"
                className="mx-auto flex max-w-3xl items-center gap-2 text-xs text-muted-foreground"
              >
                <LoaderCircleIcon
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Working
              </div>
            )}
          {session.outcome &&
            !["done", "placed", "queued"].includes(session.outcome) && (
              <p role="status" className="text-sm text-muted-foreground">
                Last input ended: {session.outcome}
              </p>
            )}
        </div>
        {!history.following && (
          <div className="sticky bottom-3 flex justify-center">
            <Button
              size="icon-sm"
              variant="outline"
              className="bg-background shadow-sm"
              aria-label="Jump to latest message"
              title="Jump to latest message"
              onClick={history.jumpToLatest}
            >
              <ArrowDownIcon />
            </Button>
          </div>
        )}
      </section>
      {!!session.queue?.length && (
        <section
          aria-label="Queued messages"
          className="max-h-48 shrink-0 overflow-auto border-t px-4 py-2 text-xs"
        >
          {session.queue.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 py-1"
            >
              <p className="whitespace-pre-wrap wrap-break-word">
                <strong>{item.mode === "steer" ? "Steer" : "Follow-up"}</strong>{" "}
                · {item.text}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={!online || working}
                onClick={() => onWithdraw(item.id)}
              >
                Withdraw
              </Button>
            </div>
          ))}
        </section>
      )}
      <ChatComposer
        modesAvailable={session.queue !== undefined}
        mode={mode}
        onMode={onMode}
        text={text}
        disabled={working || uncertain}
        busy={busy}
        sending={
          working ||
          !online ||
          (!uncertain &&
            ((busy && (mode === "reject" || session.queue === undefined)) ||
              session.status === "interrupted" ||
              session.status === "unavailable" ||
              dirty ||
              !configured ||
              !session.model ||
              !text.trim()))
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
                : ""
        }
        onCommand={onCommand}
        onText={onText}
        onSend={onSend}
        onCancel={() => onControl("cancel")}
      />
    </section>
  );
}

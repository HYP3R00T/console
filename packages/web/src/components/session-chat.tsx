"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Conversation, fieldClass } from "@/lib/console-api";

export function SessionChat({
  session,
  online,
  working,
  dirty,
  configured,
  text,
  uncertain,
  onText,
  onSend,
  onControl,
}: {
  session: Conversation;
  online: boolean;
  working: boolean;
  dirty: boolean;
  configured: boolean;
  text: string;
  uncertain: boolean;
  onText: (text: string) => void;
  onSend: () => void;
  onControl: (action: "cancel" | "resume") => void;
}) {
  const busy = session.status !== "idle";
  return (
    <section
      className="flex min-h-128 min-w-0 flex-col lg:min-h-0"
      aria-label="Main conversation"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{session.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Main conversation
            {session.model
              ? ` · ${session.model.modelId} · ${session.thinkingLevel}`
              : " · Choose a model to begin"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span role="status" className="rounded-md bg-muted px-2 py-1 text-xs">
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
          {busy && (
            <Button
              variant="outline"
              size="sm"
              disabled={!online || working}
              onClick={() => onControl("cancel")}
            >
              <SquareIcon data-icon="inline-start" aria-hidden="true" />
              Cancel
            </Button>
          )}
        </div>
      </header>
      <section
        className="flex-1 space-y-6 px-6 py-8 lg:overflow-y-auto"
        aria-label="Conversation history"
      >
        {!session.messages.length && (
          <div className="mx-auto max-w-lg py-12">
            <p className="text-xl font-medium">Start with a clear question.</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Choose a model and thinking level in session settings, then send
              your first message. History stays with this session.
            </p>
          </div>
        )}
        {session.hasOlder && (
          <p className="text-xs text-muted-foreground">
            Showing the most recent 100 entries. Older history remains saved.
          </p>
        )}
        {session.messages.map(
          (message) =>
            message.text && (
              <article
                key={message.id}
                className={`mx-auto max-w-3xl space-y-2 rounded-lg p-4 ${message.role === "user" ? "border bg-muted/30" : ""}`}
              >
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {message.role === "user"
                    ? "You"
                    : message.role === "toolResult"
                      ? `Tool · ${message.toolName}`
                      : "Assistant"}
                </h2>
                <p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">
                  {message.text}
                </p>
              </article>
            ),
        )}
        {session.partial && (
          <article className="mx-auto max-w-3xl space-y-2 p-4">
            <h2 className="text-xs font-medium text-muted-foreground">
              Assistant · generating
            </h2>
            <p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">
              {session.partial}
            </p>
          </article>
        )}
        {session.outcome &&
          !["done", "placed", "queued"].includes(session.outcome) && (
            <p role="status" className="text-sm text-muted-foreground">
              Last input ended: {session.outcome}
            </p>
          )}
      </section>
      <form
        className="space-y-3 border-t bg-background p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <label className="sr-only" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          className={`${fieldClass} resize-y`}
          rows={3}
          maxLength={32000}
          placeholder="Message this session…"
          value={text}
          disabled={working || uncertain}
          onChange={(event) => onText(event.target.value)}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {uncertain
              ? "Delivery uncertain. Retry preserves the same request ID."
              : dirty
                ? "Save your session settings before sending."
                : session.sandbox?.enabled
                  ? "Saved on this machine · sandboxed tools"
                  : "Saved on this machine · no workspace tools"}
          </p>
          <Button
            type="submit"
            disabled={
              working ||
              !online ||
              (!uncertain &&
                (busy ||
                  dirty ||
                  !configured ||
                  !session.model ||
                  !text.trim()))
            }
          >
            <ArrowUpIcon data-icon="inline-start" aria-hidden="true" />
            {uncertain ? "Retry" : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}

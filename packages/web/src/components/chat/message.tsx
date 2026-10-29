"use client";

import { CheckIcon, CopyIcon, GitForkIcon } from "lucide-react";
import { useState } from "react";
import { ChatMarkdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import type { ChatMessage as Message } from "@/lib/chat/transcript";

export function ChatMessage({
  message,
  canFork,
  onFork,
}: {
  message: Message;
  canFork: boolean;
  onFork: (id: string) => void;
}) {
  const [copiedText, setCopiedText] = useState<string>();
  const [error, setError] = useState("");
  const user = message.role === "user";
  return (
    <article
      data-message-id={message.id}
      aria-label={user ? "Your message" : "Assistant response"}
      className={`mx-auto max-w-3xl min-w-0 ${user ? "flex justify-end" : "space-y-2"}`}
    >
      {user ? (
        <p className="max-w-[90%] whitespace-pre-wrap wrap-break-word rounded-none bg-muted/60 px-4 py-3 text-sm leading-6">
          {message.text}
        </p>
      ) : (
        <>
          <ChatMarkdown text={message.text} />
          <div className="flex gap-1 text-muted-foreground">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={
                copiedText === message.text
                  ? "Copied response"
                  : "Copy response"
              }
              title={copiedText === message.text ? "Copied" : "Copy response"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message.text);
                  setCopiedText(message.text);
                  setError("");
                } catch {
                  setError("Could not copy the response.");
                }
              }}
            >
              {copiedText === message.text ? <CheckIcon /> : <CopyIcon />}
            </Button>
            {message.entryId && (
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={!canFork}
                aria-label="Fork from this response"
                title="Fork from this response"
                onClick={() => onFork(message.entryId ?? "")}
              >
                <GitForkIcon />
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </article>
  );
}

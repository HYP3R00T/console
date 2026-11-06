"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import type { ChatMessage, Execution } from "./conversation-state";
import { ExecutionStatus } from "./execution-status";
import { MessageMarkdown } from "./message-markdown";

type Review = {
  messages: Pick<ChatMessage, "id" | "role" | "text" | "failed">[];
  partial: string;
  busy: boolean;
  execution: Execution;
};

export function ReviewTranscript({
  reviewId,
  path,
  request,
  follow = false,
}: {
  reviewId: number;
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  follow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<Review>(`${path}/reviews/${reviewId}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setReview(next);
        setError(undefined);
        if (follow || next.busy) timer = setTimeout(() => void load(), 1500);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the review.",
          );
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [follow, open, path, request, reviewId]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button variant="ghost" size="xs" />}>
        {open ? "Hide reviewer transcript" : "Show reviewer transcript"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 flex flex-col gap-2 border-l pl-3">
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {!review && !error && <p role="status">Loading reviewer…</p>}
          {review?.messages
            .filter(({ text }) => !!text)
            .map((message) => (
              <div key={message.id}>
                <p className="font-medium">
                  {message.role === "user"
                    ? "Review brief"
                    : message.role === "tool"
                      ? "File read"
                      : "Reviewer"}
                </p>
                {message.role === "tool" ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                    {message.text}
                  </pre>
                ) : (
                  <MessageMarkdown compact text={message.text} />
                )}
              </div>
            ))}
          {review?.partial && <MessageMarkdown compact text={review.partial} />}
          {review?.busy && <p role="status">Reviewer is working…</p>}
          <ExecutionStatus execution={review?.execution} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

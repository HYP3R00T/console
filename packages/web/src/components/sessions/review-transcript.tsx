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
  jobTaskId,
  path,
  request,
  follow = false,
  agentId,
  active = true,
}: {
  reviewId?: number;
  jobTaskId?: number;
  agentId?: string;
  active?: boolean;
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  follow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open || !active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<Review>(
          jobTaskId !== undefined
            ? `${path}/jobs/${jobTaskId}`
            : agentId
              ? `${path}/agents/${agentId}`
              : `${path}/reviews/${reviewId}`,
          {
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) return;
        setReview(next);
        setError(undefined);
        if (follow || next.busy) timer = setTimeout(() => void load(), 1500);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the transcript.",
          );
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, agentId, follow, jobTaskId, open, path, request, reviewId]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button variant="ghost" size="xs" />}>
        {open
          ? "Hide transcript"
          : jobTaskId !== undefined
            ? "Show job transcript"
            : agentId
              ? "Show agent transcript"
              : "Show reviewer transcript"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 flex flex-col gap-2 border-l pl-3">
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {!review && !error && <p role="status">Loading transcript…</p>}
          {review?.messages
            .filter(({ text }) => !!text)
            .map((message) => (
              <div key={message.id}>
                <p className="font-medium">
                  {message.role === "user"
                    ? "Request"
                    : message.role === "tool"
                      ? "Tool result"
                      : jobTaskId !== undefined
                        ? "Worker"
                        : agentId
                          ? "Agent"
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
          {review?.busy && <p role="status">Agent is working…</p>}
          <ExecutionStatus execution={review?.execution} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

"use client";

import { ChevronRight, GitFork } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { MessageAttachments } from "./attachment-list";
import type { Execution } from "./conversation-state";
import type { ConversationTurn as Turn } from "./conversation-turns";
import { MessageMarkdown } from "./message-markdown";
import { ReviewTranscript } from "./review-transcript";
import { ToolActivity } from "./tool-activity";

export function ConversationTurn({
  turn,
  working,
  partial,
  activeTools,
  liveTools,
  path,
  request,
  fork,
  forkDisabled,
}: {
  turn: Turn;
  working: boolean;
  partial?: string;
  activeTools: { name: string; status: string }[];
  liveTools?: Execution["tools"];
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  fork?: (entryId: number) => void;
  forkDisabled?: boolean;
}) {
  const shownReviews = new Set<number>();
  const forkAction = (entryId: number) =>
    fork && (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={forkDisabled}
        onClick={() => fork(entryId)}
      >
        <GitFork data-icon="inline-start" />
        Fork from here
      </Button>
    );
  const files = (message: NonNullable<Turn["prompt"]>) =>
    !!message.attachments?.length && (
      <MessageAttachments
        files={message.attachments}
        path={path}
        entryId={message.entryId}
        request={request}
      />
    );
  return (
    <section
      aria-label={turn.prompt ? "Conversation exchange" : "Earlier exchange"}
      className="flex min-w-0 flex-col gap-5 py-5"
    >
      {turn.prompt && (
        <article
          aria-label="Your message"
          data-message-id={turn.prompt.id}
          className="flex min-w-0 flex-col items-end"
        >
          <Bubble
            align="end"
            variant="muted"
            className="max-w-[90%] sm:max-w-[80%]"
          >
            <BubbleContent className="space-y-2 rounded-2xl px-4 py-3 text-sm leading-7">
              {files(turn.prompt)}
              <p className="whitespace-pre-wrap break-words">
                {turn.prompt.text}
              </p>
            </BubbleContent>
          </Bubble>
          {forkAction(turn.prompt.entryId)}
        </article>
      )}
      {(turn.activity.length > 0 || working) && (
        <Collapsible
          data-message-id={`activity:${turn.id}`}
          className="min-w-0 text-xs text-muted-foreground"
        >
          <CollapsibleTrigger className="group flex items-center gap-2 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>
              {working ? "Working" : "Activity"}
              {turn.activity.length > 0
                ? ` · ${turn.activity.length} events`
                : "…"}
            </span>
            <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90 motion-reduce:transition-none" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 space-y-3 border-l border-dashed border-border pl-4">
              {!turn.prompt && (
                <p>Earlier prompt is outside the loaded history.</p>
              )}
              {turn.activity.flatMap((event) => {
                const reviewId =
                  event.reviewId ??
                  liveTools?.find((tool) => tool.callId === event.callId)
                    ?.reviewId;
                const showReview =
                  reviewId !== undefined && !shownReviews.has(reviewId);
                if (reviewId !== undefined) shownReviews.add(reviewId);
                return [
                  <ToolActivity
                    key={event.id}
                    label={event.label}
                    content={event.content}
                    failed={event.failed}
                  />,
                  showReview && (
                    <ReviewTranscript
                      key={`review:${reviewId}`}
                      reviewId={reviewId}
                      path={path}
                      request={request}
                    />
                  ),
                ];
              })}
              {working && (
                <p role="status">
                  {activeTools.length
                    ? `Running · ${[...new Set(activeTools.map((tool) => tool.name))].join(", ")}`
                    : "Waiting for the next response…"}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {turn.replies.map((message) => (
        <article
          key={message.id}
          data-message-id={message.id}
          aria-label="Assistant response"
          className="min-w-0 space-y-2"
        >
          {files(message)}
          <MessageMarkdown text={message.text} />
          {message.failed && (
            <p className="text-xs text-destructive">
              Response interrupted or failed.
            </p>
          )}
          {!message.failed &&
            !message.toolCalls?.length &&
            forkAction(message.entryId)}
        </article>
      ))}
      {partial && (
        <article
          aria-label="Assistant response in progress"
          className="min-w-0"
        >
          <MessageMarkdown text={partial} />
        </article>
      )}
    </section>
  );
}

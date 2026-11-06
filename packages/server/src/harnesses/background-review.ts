import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  type ConversationId,
  defineDocFamily,
  defineEntry,
  defineExtension,
  defineTask,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { reviewChild, reviewFindings } from "./reviewer.ts";

export const ReviewRequests = defineDocFamily<{ taskId?: number }, null>({
  kind: "console.review-request",
  version: 1,
  family: true,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({}),
  checkpointWhen: () => true,
});

export const BackgroundReviewEntry = defineEntry<{
  status: "completed" | "failed" | "cancelled";
  text: string;
  reviewId?: number;
}>("console.background-review");

export const BackgroundReview = defineTask<
  {
    brief: string;
    at: number;
    model: ModelRef;
    thinkingLevel: ModelThinkingLevel | null;
  },
  { phase: "schedule" | "review" },
  boolean
>({
  name: "console.background-review",
  version: 1,
  initial: () => ({ phase: "schedule" }),
  phases: {
    async schedule(task, runtime, context) {
      if (task.input.at > runtime.now()) {
        await runtime.sleepUntil(task.input.at, { phase: "review" }, context);
      } else {
        await runtime.commit(
          () => ({ status: "running", checkpoint: { phase: "review" } }),
          context,
        );
      }
    },
    async review(task, runtime, context) {
      let reviewId: ConversationId | undefined;
      await runtime.commit(async (tx) => {
        reviewId = await reviewChild(tx, runtime.taskId, {
          model: task.input.model,
          thinkingLevel: task.input.thinkingLevel,
        });
      }, context);
      if (reviewId === undefined)
        throw new Error("Reviewer conversation could not be created.");
      const child = await runtime.conversation(reviewId, context);
      if (!child) throw new Error("Reviewer conversation is unavailable.");
      const submission = await child.submit(
        {
          type: "input",
          content: task.input.brief,
          requestId: `console.review:${runtime.taskId}`,
        },
        context,
      );
      const settled = await submission.wait(context);
      await runtime.commit(async (tx) => {
        const findings =
          settled.status === "done" && settled.type === "input"
            ? reviewFindings(await tx.entry(AssistantEntry, settled.answer))
            : undefined;
        await tx.appendEntry(BackgroundReviewEntry, runtime.conversationId, {
          data: {
            status: findings ? "completed" : "failed",
            text: findings || "The reviewer stopped before returning findings.",
            reviewId,
          },
        });
        return {
          status: "terminal",
          outcome: { status: "completed", result: !!findings },
        };
      }, context);
    },
  },
  async abort(_task, runtime, context) {
    await runtime.commit(async (tx) => {
      const [child] = (
        await tx.scanConversations({ ownerTaskId: runtime.taskId }, 1)
      ).items;
      await tx.appendEntry(BackgroundReviewEntry, runtime.conversationId, {
        data: {
          status: "cancelled",
          text: "The background review was stopped.",
          ...(child && { reviewId: child.id }),
        },
      });
      return { status: "terminal", outcome: { status: "aborted" } };
    }, context);
  },
});

export const BackgroundReviewExtension = defineExtension({
  name: "console.background-reviews",
  tasks: [BackgroundReview],
});

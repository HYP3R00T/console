import type {
  ConversationId,
  ConversationView,
  EntryRecord,
  InboxState,
  LiveState,
  TaskGraph,
} from "@earendil-works/pi-durable";
import { codeModeCalls } from "./advanced-tools.ts";
import { attachedInput } from "./attachments.ts";
import { BackgroundJob, BackgroundJobEntry } from "./background-job.ts";
import {
  BackgroundReview,
  BackgroundReviewEntry,
} from "./background-review.ts";
import { AgentReportEntry } from "./persistent-agents.ts";
import { PlanExtension } from "./plan.ts";
import { PostRunEntry } from "./post-run.ts";
import { queueView } from "./queue.ts";
import { RecurringJob } from "./recurring-job.ts";
import { RecurringReview } from "./recurring-review.ts";
import { canContinue } from "./service.ts";
import { budgetReached } from "./token-budget.ts";

const visibleTools = new Set([
  // Keep results from the retired inspection tools visible in saved history.
  "list_directory",
  "read_file",
  "search_text",
  "read",
  "write",
  "edit",
  "bash",
  "submit_plan",
  "review_workspace",
  "background_agent",
  "stop_background_agent",
  "codemode",
  "tool_search",
]);
const isVisibleTool = (name: string) =>
  visibleTools.has(name) ||
  name.startsWith("mcp__") ||
  /^user_[a-z0-9_]{1,59}$/.test(name);
type ChatMessage = {
  id: string;
  entryId: number;
  role: "user" | "assistant" | "tool";
  text: string;
  failed: boolean;
  attachments?: {
    name: string;
    mimeType: string;
    size: number;
    index: number;
    thumbnail?: string;
  }[];
  toolName?: string;
  reviewId?: number;
  activityLabel?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
};

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}
function preview(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n[Preview truncated]`
    : value;
}
const failureReasons = new Set([
  "aborted",
  "model_error",
  "no_model",
  "run_failed",
  "withdrawn",
  "interrupted",
  "restart_limit",
  "nothing_to_answer",
  "turn_limit",
  "reset",
  "faulted",
  "orphaned",
  "missing_task",
  "task_too_old",
  "migration_failed",
  "stale",
]);
const safeReason = (reason: string) =>
  failureReasons.has(reason) ? reason : "failed";

function reviewReference(name: string, details: unknown) {
  if (
    name !== "review_workspace" ||
    !details ||
    typeof details !== "object" ||
    !("reviewId" in details)
  )
    return {};
  const { reviewId } = details;
  return typeof reviewId === "number" &&
    Number.isSafeInteger(reviewId) &&
    reviewId > 0
    ? { reviewId }
    : {};
}

/** Only publish stable lifecycle metadata. Diagnostics can contain credentials or provider payloads. */
export function executionView(live: LiveState | undefined) {
  const tools = [...(live?.tools ?? []), ...(live?.nestedTools ?? [])]
    .filter((tool) => isVisibleTool(tool.name) && tool.status !== "done")
    .map(({ callId, name, status, details }) => ({
      callId,
      name,
      status,
      ...reviewReference(name, details),
    }));
  const compactions = (live?.compactions ?? []).map(
    ({ taskId, trigger, blocking, attempt, retry }) => ({
      taskId,
      trigger,
      blocking,
      attempt,
      ...(retry ? { retryAt: retry.at } : {}),
    }),
  );
  return {
    state: !live?.run
      ? "idle"
      : live.run.afterRun
        ? "finishing"
        : live.generation?.retry
          ? "retrying"
          : compactions.some((task) => task.blocking)
            ? "compacting"
            : tools.length
              ? "tools"
              : live.generation?.deferred
                ? "deferred"
                : "running",
    ...(live?.generation ? { attempt: live.generation.attempt } : {}),
    ...(live?.generation?.retry ? { retryAt: live.generation.retry.at } : {}),
    ...(live?.generation?.deferred
      ? { pollAt: live.generation.deferred.pollAt }
      : {}),
    ...(live?.runFailure
      ? {
          failure: {
            reason:
              live.runFailure.reason === "model_error" &&
              live.runFailure.detail === budgetReached
                ? "budget_limit"
                : safeReason(live.runFailure.reason),
            taskId: live.runFailure.taskId,
            ...(canContinue(live.runFailure.reason) && { canContinue: true }),
          },
        }
      : {}),
    ...(live?.compactionFailure
      ? { compactionFailure: { trigger: live.compactionFailure.trigger } }
      : {}),
    tools,
    compactions,
  };
}

function resultText(message: {
  content: unknown;
  toolName: string;
  details?: unknown;
}) {
  const output = text(message.content);
  if (message.toolName !== "codemode") return output;
  const calls = codeModeCalls(message.details);
  if (!calls.length) return output;
  const rows = calls
    .slice(0, 30)
    .map(({ name, status }) => `- ${name}: ${status}`);
  if (calls.length > rows.length)
    rows.push(`- ${calls.length - rows.length} more`);
  return `Nested tools\n${rows.join("\n")}\n\n${output}`;
}

/** Raw entry boundaries include invisible system/reset/compaction records. */
export function historyWindow(
  entries: readonly EntryRecord[],
  before?: EntryRecord["id"],
) {
  return {
    ids: entries.map((entry) => entry.id),
    ...(before === undefined ? {} : { before }),
  };
}
export function messages(entries: readonly EntryRecord[]) {
  return entries.flatMap<ChatMessage>((entry) =>
    entry.kind === "console.job-context" ||
    entry.kind === "console.job-follow-up" ||
    entry.kind === "console.review-context" ||
    entry.kind === "console.review-follow-up" ||
    entry.kind === "console.agent-context" ||
    entry.kind === "console.agent-follow-up"
      ? []
      : BackgroundJobEntry.is(entry)
        ? [
            {
              id: `${entry.id}:job`,
              entryId: entry.id,
              role: "tool",
              text: entry.data.text,
              failed: entry.data.status !== "completed",
              activityLabel: `Background job · ${entry.data.status}`,
            },
          ]
        : AgentReportEntry.is(entry)
          ? [
              {
                id: `${entry.id}:agent`,
                entryId: entry.id,
                role: "tool",
                text: entry.data.text,
                failed: entry.data.status !== "completed",
                activityLabel: `Agent ${entry.data.name} · ${entry.data.status}`,
              },
            ]
          : BackgroundReviewEntry.is(entry)
            ? [
                {
                  id: `${entry.id}:review`,
                  entryId: entry.id,
                  role: "tool",
                  text: entry.data.text,
                  failed: entry.data.status !== "completed",
                  activityLabel: `Background review · ${entry.data.status}`,
                  reviewId: entry.data.reviewId,
                },
              ]
            : PostRunEntry.is(entry)
              ? [
                  {
                    id: `${entry.id}:check`,
                    entryId: entry.id,
                    role: "tool",
                    text: entry.data.output,
                    failed: entry.data.status !== "passed",
                    activityLabel: `Post-run check · ${entry.data.status}`,
                  },
                ]
              : (entry.model ?? []).flatMap<ChatMessage>((message, index) => {
                  if (
                    message.role === "toolResult" &&
                    isVisibleTool(message.toolName)
                  )
                    return [
                      {
                        id: `${entry.id}:${index}`,
                        entryId: entry.id,
                        role: "tool" as const,
                        text: preview(resultText(message), 4000),
                        failed: message.isError,
                        toolName: message.toolName,
                        ...reviewReference(message.toolName, message.details),
                      },
                    ];
                  if (message.role !== "user" && message.role !== "assistant")
                    return [];
                  const calls =
                    message.role === "assistant"
                      ? message.content
                          .filter(
                            (block) =>
                              block.type === "toolCall" &&
                              isVisibleTool(block.name),
                          )
                          .map((block) => ({
                            id: block.type === "toolCall" ? block.id : "",
                            name: block.type === "toolCall" ? block.name : "",
                            arguments:
                              block.type === "toolCall"
                                ? preview(JSON.stringify(block.arguments), 1000)
                                : "",
                          }))
                      : [];
                  if (
                    !text(message.content) &&
                    !calls.length &&
                    message.role === "assistant" &&
                    message.stopReason === "toolUse"
                  )
                    return [];
                  return [
                    {
                      id: `${entry.id}:${index}`,
                      entryId: entry.id,
                      role: message.role,
                      text:
                        message.role === "user"
                          ? (attachedInput(entry)?.text ??
                            text(message.content))
                          : text(message.content),
                      ...(message.role === "user" && attachedInput(entry)
                        ? {
                            attachments: attachedInput(entry)?.attachments.map(
                              ({ name, mimeType, size, thumbnail }, index) => ({
                                name,
                                mimeType,
                                size,
                                index,
                                ...(thumbnail ? { thumbnail } : {}),
                              }),
                            ),
                          }
                        : {}),
                      ...(calls.length ? { toolCalls: calls } : {}),
                      failed:
                        message.role === "assistant" &&
                        ["error", "aborted"].includes(message.stopReason),
                    },
                  ];
                }),
  );
}

export function taskGraphView(
  graph: TaskGraph,
  root: ConversationId,
  owned: readonly ConversationId[] = [],
) {
  const byConversation = new Map<
    ConversationId,
    (typeof graph.tasks)[string][]
  >();
  for (const task of Object.values(graph.tasks)) {
    const tasks = byConversation.get(task.conversationId) ?? [];
    tasks.push(task);
    byConversation.set(task.conversationId, tasks);
  }
  const scope = new Set([root, ...owned]);
  const tasks = [];
  for (const id of scope) {
    for (const task of byConversation.get(id) ?? []) {
      for (const child of task.conversations) scope.add(child);
      const { state } = task;
      tasks.push({
        id: task.id,
        kind: task.kind,
        conversationId: task.conversationId,
        owner: task.owner,
        status: state.status,
        blocked: task.blocked,
        background: task.background,
        abortRequested: task.abortRequested,
        ...(task.kind === BackgroundReview.definition.name && {
          stoppable: true,
          reviewId: task.conversations[0],
        }),
        ...([
          BackgroundJob.definition.name,
          RecurringJob.definition.name,
        ].includes(task.kind) && { stoppable: true, job: true }),
        ...(task.kind === BackgroundJob.definition.name &&
          task.conversations.length > 0 && { jobTaskId: task.id }),
        ...(task.kind === RecurringReview.definition.name && {
          stoppable: true,
        }),
        ...(state.status === "sleeping" && { wakeAt: state.until }),
      });
    }
  }
  return { tasks: tasks.slice(0, 100), more: tasks.length > 100 };
}
export function conversationView(view: ConversationView) {
  const live = view.docs["pi.live"] as LiveState | undefined;
  const generation = live?.generation as
    | { message?: { content?: unknown } }
    | undefined;
  const inbox = view.docs["pi.inbox"] as InboxState | undefined;
  const agent = view.docs["pi.agent"];
  const entries = view.entries.slice(-50);
  return {
    id: view.conversation.id,
    messages: messages(entries),
    history: historyWindow(
      entries,
      view.entries.length > 50 ? view.entries.at(-51)?.id : view.before,
    ),
    execution: executionView(live),
    hasEarlier: view.before !== undefined || view.entries.length > 50,
    busy: !!live?.run,
    partial: text(generation?.message?.content),
    activeTools: ((live?.tools ?? []) as { name: string; status: string }[])
      .filter((tool) => isVisibleTool(tool.name) && tool.status !== "done")
      .map(({ name, status }) => ({ name, status })),
    queued: inbox?.items?.length ?? 0,
    queue: queueView(inbox?.items ?? []),
    model: agent?.model,
    thinkingLevel: agent?.thinkingLevel,
    planMode:
      Array.isArray(agent?.extensions) &&
      agent.extensions.includes(PlanExtension.name),
  };
}

/** Submission details/trace may contain provider diagnostics; only publish stable lifecycle fields. */
export function submissionView(
  record: import("@earendil-works/pi-durable").SubmissionRecord,
) {
  return {
    id: record.id,
    conversationId: record.conversationId,
    type: record.type,
    status: record.status,
    ...(record.entry !== undefined ? { entry: record.entry } : {}),
    ...(record.answer !== undefined ? { answer: record.answer } : {}),
    ...(record.status === "unanswered"
      ? { reason: safeReason(record.reason) }
      : {}),
  };
}

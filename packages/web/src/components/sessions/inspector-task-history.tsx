"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { taskLabels } from "./inspector-tasks";
import { ReviewTranscript } from "./review-transcript";

type Receipt = {
  id: number;
  kind: string;
  owner?: number;
  background: boolean;
  status: "completed" | "failed" | "aborted" | "orphaned" | "faulted";
  startedAt?: number;
  endedAt?: number;
  restarts: number;
  diagnostic?: string;
  reviewSucceeded?: boolean;
  reviewId?: number;
  jobTaskId?: number;
  jobSucceeded?: boolean;
  retryable?: boolean;
  recheckable?: boolean;
  checkResult?: "passed" | "failed" | "cancelled" | "interrupted";
  retryOf?: number;
};
type Page = { tasks: Receipt[]; cursor?: string };
type Props = {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  active: boolean;
};

export function InspectorTaskHistory(props: Props) {
  const [reviewId, setReviewId] = useState<number>();
  return (
    <HistoryPage
      key={`${props.path}/${reviewId ?? "root"}`}
      {...props}
      reviewId={reviewId}
      selectReview={setReviewId}
    />
  );
}

function HistoryPage({
  path,
  request,
  active,
  reviewId,
  selectReview,
}: Props & {
  reviewId?: number;
  selectReview: (id?: number) => void;
}) {
  const [page, setPage] = useState<Page>();
  const [query, setQuery] = useState<{ cursor?: string; revision: number }>({
    revision: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [retrying, setRetrying] = useState<number>();
  const [retried, setRetried] = useState<Record<number, number>>({});
  const [actionError, setActionError] = useState<string>();
  const retryRequests = useRef(new Map<number, string>());
  const [acknowledged, setAcknowledged] = useState<Record<number, boolean>>({});
  async function retry(task: Receipt) {
    const taskId = task.id;
    const isJob = task.kind === "console.background-job";
    const isCheck = task.kind === "console.post-run-check";
    if ((isJob || isCheck) && !acknowledged[taskId]) return;
    if (retrying !== undefined) return;
    const requestId = retryRequests.current.get(taskId) ?? crypto.randomUUID();
    retryRequests.current.set(taskId, requestId);
    setRetrying(taskId);
    setActionError(undefined);
    try {
      const job = await request<{ id: number }>(
        `${path}/${isCheck ? "checks" : isJob ? "jobs" : "reviews"}/tasks/${taskId}/${isCheck ? "recheck" : "retry"}`,
        {
          method: "POST",
          body: JSON.stringify({
            requestId,
            ...((isJob || isCheck) && { acknowledgeEffects: true }),
          }),
        },
      );
      setRetried((previous) => ({ ...previous, [taskId]: job.id }));
      setQuery((previous) => ({ revision: previous.revision + 1 }));
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not retry the task.",
      );
    } finally {
      setRetrying(undefined);
    }
  }
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (reviewId !== undefined) params.set("reviewId", String(reviewId));
    if (query.cursor) params.set("cursor", query.cursor);
    setLoading(true);
    setError(undefined);
    void request<Page>(`${path}/tasks/history?${params}`, {
      signal: controller.signal,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setPage((previous) => ({
          ...next,
          tasks: query.cursor
            ? [
                ...new Map(
                  [...(previous?.tasks ?? []), ...next.tasks].map((task) => [
                    task.id,
                    task,
                  ]),
                ).values(),
              ]
            : next.tasks,
        }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load task history.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, path, query, request, reviewId]);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          {reviewId === undefined
            ? "Completed tasks"
            : `Reviewer #${reviewId} tasks`}
        </CardTitle>
        <CardDescription>
          Finished work, newest task first. Refresh to include newly finished
          tasks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p role="alert">{error}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        {!page && loading && <p role="status">Loading history…</p>}
        {page?.tasks.length === 0 && <p>No completed tasks.</p>}
        <ScrollArea viewportClassName="max-h-96">
          <ul className="flex flex-col gap-3 pr-3">
            {page?.tasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-1 wrap-anywhere">
                <p>
                  {Object.hasOwn(taskLabels, task.kind)
                    ? taskLabels[task.kind]
                    : task.kind}{" "}
                  · #{task.id}
                </p>
                <p className="text-muted-foreground">
                  {task.jobSucceeded === false
                    ? "No answer returned"
                    : task.reviewSucceeded === false
                      ? "No findings returned"
                      : (task.checkResult ?? task.status)}
                  {task.owner !== undefined && ` · Owned by #${task.owner}`}
                  {task.background && " · Background"}
                </p>
                {task.diagnostic && <p>{task.diagnostic}</p>}
                {task.retryOf !== undefined && <p>Retry of #{task.retryOf}</p>}
                {reviewId === undefined &&
                  (task.retryable || task.recheckable) &&
                  (retried[task.id] !== undefined ? (
                    <p role="status">
                      {task.recheckable
                        ? "Recheck requested."
                        : `Replacement #${retried[task.id]} started.`}
                    </p>
                  ) : (
                    <>
                      {(task.kind === "console.background-job" ||
                        task.recheckable) && (
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`retry-effects-${task.id}`}
                            checked={acknowledged[task.id] ?? false}
                            onCheckedChange={(checked) =>
                              setAcknowledged((current) => ({
                                ...current,
                                [task.id]: checked === true,
                              }))
                            }
                          />
                          <FieldLabel htmlFor={`retry-effects-${task.id}`}>
                            I understand earlier tool or file effects may
                            remain.
                          </FieldLabel>
                        </Field>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={
                          retrying !== undefined ||
                          ((task.kind === "console.background-job" ||
                            task.recheckable) &&
                            !acknowledged[task.id])
                        }
                        onClick={() => void retry(task)}
                      >
                        {retrying === task.id
                          ? "Retrying…"
                          : task.recheckable
                            ? "Recheck with assistant"
                            : task.kind === "console.background-job"
                              ? "Retry job"
                              : "Retry review"}
                      </Button>
                      <p className="text-muted-foreground">
                        {task.recheckable
                          ? "Starts an assistant run, then executes the currently configured check in the current workspace. Uses the model and token budget; queued input waits for the check. Earlier effects may happen again."
                          : task.kind === "console.background-job"
                            ? "Starts one new job with the original instructions, model, tools and checks. Changed workspace policy or disabled tools block retry. It does not resume the old worker or restart a recurring schedule."
                            : "Starts a new review with its original settings in the current workspace."}
                      </p>
                    </>
                  ))}
                {task.startedAt !== undefined && (
                  <p>Started {new Date(task.startedAt).toLocaleString()}</p>
                )}
                {task.endedAt !== undefined && (
                  <p>Finished {new Date(task.endedAt).toLocaleString()}</p>
                )}
                {task.restarts > 0 && (
                  <p>Consecutive interrupted attempts: {task.restarts}</p>
                )}
                {task.jobTaskId !== undefined && (
                  <ReviewTranscript
                    path={path}
                    request={request}
                    jobTaskId={task.jobTaskId}
                  />
                )}
                {reviewId === undefined && task.reviewId !== undefined && (
                  <>
                    <ReviewTranscript
                      path={path}
                      request={request}
                      reviewId={task.reviewId}
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => selectReview(task.reviewId)}
                    >
                      View reviewer tasks
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {reviewId !== undefined && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => selectReview(undefined)}
          >
            Back to conversation tasks
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={loading}
          onClick={() => setQuery({ revision: query.revision + 1 })}
        >
          Refresh history
        </Button>
        {page?.cursor && (
          <Button
            size="xs"
            variant="outline"
            disabled={loading}
            onClick={() =>
              setQuery({ cursor: page.cursor, revision: query.revision + 1 })
            }
          >
            {loading ? "Loading…" : "Load older tasks"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

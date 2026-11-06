"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { ReviewTranscript } from "./review-transcript";

type Task = {
  id: number;
  kind: string;
  owner?: number;
  status: string;
  blocked?: string;
  background: boolean;
  abortRequested: boolean;
  wakeAt?: number;
  stoppable?: boolean;
  reviewId?: number;
};
const labels: Record<string, string> = {
  "console.post-run-check": "Post-run check",
  "console.background-review": "Background review",
  "pi.generation": "Model generation",
  "pi.tool": "Tool call",
  "pi.compaction": "Context compaction",
};

export function InspectorTasks({
  path,
  request,
  active,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  active: boolean;
}) {
  const [snapshot, setSnapshot] = useState<{ tasks: Task[]; more: boolean }>();
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [stopping, setStopping] = useState<number>();
  async function stop(id: number) {
    setActionError(undefined);
    setStopping(id);
    try {
      await request(`${path}/reviews/tasks/${id}`, { method: "DELETE" });
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not stop the review.",
      );
    } finally {
      setStopping(undefined);
    }
  }
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<{ tasks: Task[]; more: boolean }>(
          `${path}/tasks`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setSnapshot(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load active tasks.",
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 1500);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, path, request]);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Active tasks</CardTitle>
        <CardDescription>
          Work in this conversation and its task-owned chats.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(error || actionError) && (
          <p role="alert" className="text-destructive">
            {actionError ?? error}
          </p>
        )}
        {!snapshot && !error && <p role="status">Loading tasks…</p>}
        {snapshot?.tasks.length === 0 && <p>No active tasks.</p>}
        <ul className="flex flex-col gap-2">
          {snapshot?.tasks.map((task) => (
            <li key={task.id} className="wrap-anywhere">
              <div>
                {Object.hasOwn(labels, task.kind)
                  ? labels[task.kind]
                  : task.kind}{" "}
                · #{task.id}
              </div>
              <div className="text-muted-foreground">
                {task.abortRequested
                  ? "Stopping"
                  : task.blocked
                    ? `Blocked (${task.blocked.replaceAll("_", " ")})`
                    : task.status}
                {task.owner !== undefined && ` · Owned by #${task.owner}`}
                {task.background && " · Background"}
                {task.wakeAt !== undefined &&
                  ` · Wakes at ${new Date(task.wakeAt).toLocaleString()}`}
              </div>
              {task.stoppable && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={stopping !== undefined || task.abortRequested}
                  onClick={() => void stop(task.id)}
                >
                  {stopping === task.id || task.abortRequested
                    ? "Stopping…"
                    : "Stop review"}
                </Button>
              )}
              {active && task.reviewId !== undefined && (
                <ReviewTranscript
                  path={path}
                  request={request}
                  reviewId={task.reviewId}
                  follow
                />
              )}
            </li>
          ))}
        </ul>
        {snapshot?.more && <p>Showing the first 100 tasks.</p>}
      </CardContent>
    </Card>
  );
}

export function ScheduleReview({
  path,
  request,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const id = useId();
  const [brief, setBrief] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const delivery = useRef<{ signature: string; requestId: string }>(undefined);
  const at = when ? new Date(when).getTime() : undefined;
  const invalid = at !== undefined && !Number.isFinite(at);
  async function schedule() {
    if (!brief.trim() || saving || invalid) return;
    const signature = JSON.stringify([brief.trim(), at]);
    if (delivery.current?.signature !== signature)
      delivery.current = { signature, requestId: crypto.randomUUID() };
    setSaving(true);
    setMessage(undefined);
    try {
      const job = await request<{ id: number }>(`${path}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          brief: brief.trim(),
          at,
          requestId: delivery.current.requestId,
        }),
      });
      delivery.current = undefined;
      setBrief("");
      setWhen("");
      setMessage({ text: `Review #${job.id} scheduled.` });
    } catch (cause) {
      setMessage({
        text:
          cause instanceof Error
            ? cause.message
            : "Could not schedule the review.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Background review</CardTitle>
        <CardDescription>
          Use the saved model to review the workspace while this chat stays
          available.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-brief`}>Review brief</FieldLabel>
          <Textarea
            id={`${id}-brief`}
            value={brief}
            maxLength={8000}
            disabled={saving}
            onChange={(event) => setBrief(event.target.value)}
          />
        </Field>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={`${id}-when`}>Start time</FieldLabel>
          <Input
            id={`${id}-when`}
            type="datetime-local"
            value={when}
            disabled={saving}
            aria-describedby={`${id}-when-help`}
            aria-invalid={invalid}
            onChange={(event) => setWhen(event.target.value)}
          />
          <FieldDescription id={`${id}-when-help`}>
            Uses your local time. Leave blank to start now.
          </FieldDescription>
        </Field>
        {message && (
          <p role={message.error ? "alert" : "status"}>{message.text}</p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          size="xs"
          disabled={saving || invalid || !brief.trim()}
          onClick={() => void schedule()}
        >
          {saving
            ? "Scheduling…"
            : at === undefined
              ? "Start review"
              : "Schedule review"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function PostRunSettings({
  value,
  disabled,
  save,
}: {
  value: string | null;
  disabled: boolean;
  save: (command: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{
    value: string;
    original: string | null;
  }>();
  const command = draft?.value ?? value ?? "";
  const stale = !!draft && draft.original !== value;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Post-run check</CardTitle>
        <CardDescription>
          Run a shell command after an answered run that wrote or edited files.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field data-invalid={stale} data-disabled={disabled}>
          <FieldLabel htmlFor={id}>Check command</FieldLabel>
          <Input
            id={id}
            value={command}
            maxLength={1000}
            disabled={disabled}
            aria-invalid={stale}
            aria-describedby={`${id}-help`}
            placeholder="pnpm test"
            onChange={(event) =>
              setDraft({
                value: event.target.value,
                original: draft ? draft.original : value,
              })
            }
          />
          <FieldDescription id={`${id}-help`}>
            Runs in the workspace with the backend user’s access. Leave blank to
            disable.
          </FieldDescription>
          {stale && (
            <FieldError>
              The saved command changed elsewhere. Reset your draft.
            </FieldError>
          )}
        </Field>
      </CardContent>
      {draft && (command.trim() !== (value ?? "") || stale) && (
        <CardFooter className="justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={() => setDraft(undefined)}>
            Reset draft
          </Button>
          <Button
            size="xs"
            disabled={disabled || stale}
            onClick={async () => {
              if (await save(command.trim() || null)) setDraft(undefined);
            }}
          >
            Save command
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

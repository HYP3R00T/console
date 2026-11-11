"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { ChatModelControl } from "./chat-model-control";
import {
  InspectorSection,
  InspectorSectionActions,
  InspectorSectionContent,
  InspectorSectionDescription,
  InspectorSectionHeader,
  InspectorSectionTitle,
} from "./inspector-section";
import { ReviewTranscript } from "./review-transcript";
import { type ModelRef, useChatModels } from "./use-chat-models";
import { useReviewerProfiles } from "./use-reviewer-profiles";

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
  jobTaskId?: number;
  job?: boolean;
};
export const taskLabels: Record<string, string> = {
  "console.background-job": "Background job",
  "console.recurring-job": "Recurring job",
  "console.agent-anchor": "Persistent agent",
  "console.agent-reporter": "Agent request",
  "console.post-run-check": "Post-run check",
  "console.recurring-review": "Recurring review",
  "console.background-review": "Background review",
  "pi.generation": "Model generation",
  "pi.run": "Agent run",
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
  const { deviceId } = useParams<{ deviceId: string }>();
  const [snapshot, setSnapshot] = useState<{ tasks: Task[]; more: boolean }>();
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [stopping, setStopping] = useState<number>();
  async function stop(id: number, job = false) {
    setActionError(undefined);
    setStopping(id);
    try {
      await request(
        job ? `${path}/jobs/${id}` : `${path}/reviews/tasks/${id}`,
        { method: "DELETE" },
      );
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
    <InspectorSection>
      <InspectorSectionHeader>
        <InspectorSectionTitle>Active tasks</InspectorSectionTitle>
        <InspectorSectionDescription>
          Work in this conversation and its task-owned chats.
        </InspectorSectionDescription>
      </InspectorSectionHeader>
      <InspectorSectionContent>
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
                {Object.hasOwn(taskLabels, task.kind)
                  ? taskLabels[task.kind]
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
              {task.blocked && task.kind.startsWith("user.") && (
                <div className="flex flex-col gap-2">
                  <p>
                    Restore a compatible extension definition to resume this
                    saved task. Reinstallation does not undo earlier effects.
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    render={
                      <Link href={`/devices/${deviceId}/settings/extensions`} />
                    }
                  >
                    Manage extensions
                  </Button>
                </div>
              )}
              {task.stoppable && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={stopping !== undefined || task.abortRequested}
                  onClick={() => void stop(task.id, task.job)}
                >
                  {stopping === task.id || task.abortRequested
                    ? "Stopping…"
                    : task.job
                      ? "Stop job"
                      : "Stop review"}
                </Button>
              )}
              {active && task.jobTaskId !== undefined && (
                <ReviewTranscript
                  path={path}
                  request={request}
                  jobTaskId={task.jobTaskId}
                  follow
                />
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
      </InspectorSectionContent>
    </InspectorSection>
  );
}

export function ScheduleReview({
  path,
  request,
  savedModel,
  canChooseWorktree = false,
}: {
  path: string;
  savedModel?: ModelRef;
  canChooseWorktree?: boolean;
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const id = useId();
  const [worktrees, setWorktrees] =
    useState<{ path: string; branch: string | null }[]>();
  const [worktree, setWorktree] = useState<string>();
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [loadingWorktrees, setLoadingWorktrees] = useState(false);
  const selectedWorktree = canChooseWorktree ? worktree : undefined;
  const invalidWorktree =
    !!selectedWorktree &&
    (!!workspaceError ||
      !worktrees?.some((tree) => tree.path === selectedWorktree));
  async function loadWorktrees() {
    setLoadingWorktrees(true);
    setWorkspaceError(undefined);
    try {
      setWorktrees(
        (
          await request<{
            worktrees: { path: string; branch: string | null }[];
          }>(`${path}/worktrees`)
        ).worktrees,
      );
    } catch (cause) {
      setWorkspaceError(
        cause instanceof Error ? cause.message : "Could not load worktrees.",
      );
    } finally {
      setLoadingWorktrees(false);
    }
  }

  const models = useChatModels(request, savedModel);
  const profiles = useReviewerProfiles(request);
  const [selectedProfileId, setSelectedProfileId] = useState<string>();
  const profileId = selectedProfileId ?? profiles.snapshot?.profiles[0]?.id;
  const profile = profiles.snapshot?.profiles.find(
    (item) => item.id === profileId,
  );
  const [modelSource, setModelSource] = useState("chat");
  const [turnLimit, setTurnLimit] = useState("6");
  const [passes, setPasses] = useState("1");
  const [occurrences, setOccurrences] = useState("1");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [brief, setBrief] = useState("");
  const [when, setWhen] = useState("");
  const [resultDelivery, setResultDelivery] = useState("context");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const delivery = useRef<{ signature: string; requestId: string }>(undefined);
  const at = when ? new Date(when).getTime() : undefined;
  const invalidTime = at !== undefined && !Number.isFinite(at);
  const invalidTurns =
    modelSource !== "profile" &&
    (!/^\d+$/.test(turnLimit) ||
      Number(turnLimit) < 1 ||
      Number(turnLimit) > 50);
  const invalidPasses =
    modelSource !== "profile" &&
    (!/^\d+$/.test(passes) || Number(passes) < 1 || Number(passes) > 5);
  const invalidOccurrences =
    !/^\d+$/.test(occurrences) ||
    Number(occurrences) < 1 ||
    Number(occurrences) > 1000;
  const repeating = Number(occurrences) > 1;
  const invalidInterval =
    repeating &&
    (!/^\d+$/.test(intervalMinutes) ||
      Number(intervalMinutes) < 1 ||
      Number(intervalMinutes) > 525600);
  const recurrence = repeating
    ? {
        intervalMs: Number(intervalMinutes) * 60000,
        occurrences: Number(occurrences),
      }
    : undefined;
  const invalidModel =
    modelSource === "custom" && (!models.model || !!models.error);
  const invalidProfile =
    modelSource === "profile" &&
    (!profile ||
      !!profiles.error ||
      !profiles.snapshot?.models.some(
        (model) =>
          model.provider === profile.model.provider &&
          model.id === profile.model.modelId,
      ));
  const invalid =
    invalidOccurrences ||
    invalidInterval ||
    invalidWorktree ||
    invalidTime ||
    invalidTurns ||
    invalidPasses ||
    invalidModel ||
    invalidProfile;
  const selection =
    modelSource === "profile"
      ? { profileId }
      : modelSource === "custom" && models.model
        ? {
            model: {
              provider: models.model.provider,
              modelId: models.model.id,
            },
            thinkingLevel: models.level ?? null,
          }
        : {};
  async function schedule() {
    if (!brief.trim() || saving || invalid) return;
    const signature = JSON.stringify([
      brief.trim(),
      at,
      resultDelivery,
      selection,
      Number(turnLimit),
      Number(passes),
      selectedWorktree,
      recurrence,
    ]);
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
          delivery: resultDelivery,
          recurrence,
          ...selection,
          ...(selectedWorktree && { worktree: selectedWorktree }),
          ...(modelSource !== "profile" && {
            maxTurns: Number(turnLimit),
            passes: Number(passes),
          }),
          requestId: delivery.current.requestId,
        }),
      });
      delivery.current = undefined;
      setBrief("");
      setWhen("");
      setMessage({
        text: `${repeating ? "Recurring review" : "Review"} #${job.id} scheduled.`,
      });
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
    <InspectorSection>
      <InspectorSectionHeader>
        <InspectorSectionTitle>Background review</InspectorSectionTitle>
        <InspectorSectionDescription>
          Review the workspace independently while this chat stays available.
        </InspectorSectionDescription>
      </InspectorSectionHeader>
      <InspectorSectionContent>
        <FieldGroup>
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
          {canChooseWorktree && (
            <Field data-invalid={invalidWorktree}>
              <FieldLabel htmlFor={`${id}-workspace`}>
                Review workspace
              </FieldLabel>
              <Select
                value={selectedWorktree ?? "chat"}
                disabled={saving || loadingWorktrees}
                onValueChange={(value) => {
                  if (value !== null)
                    setWorktree(value === "chat" ? undefined : value);
                }}
              >
                <SelectTrigger
                  id={`${id}-workspace`}
                  aria-invalid={invalidWorktree}
                  className="w-full min-w-0"
                >
                  <SelectValue>
                    {selectedWorktree
                      ? (worktrees?.find(
                          (tree) => tree.path === selectedWorktree,
                        )?.branch ?? "Selected worktree")
                      : "Use chat workspace"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="chat">Use chat workspace</SelectItem>
                    {selectedWorktree &&
                      !worktrees?.some(
                        (tree) => tree.path === selectedWorktree,
                      ) && (
                        <SelectItem value={selectedWorktree} disabled>
                          Unavailable worktree · {selectedWorktree}
                        </SelectItem>
                      )}
                    {worktrees?.map((tree) => (
                      <SelectItem key={tree.path} value={tree.path}>
                        {tree.branch ?? "Detached worktree"} · {tree.path}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedWorktree && (
                <code className="wrap-anywhere">{selectedWorktree}</code>
              )}
              <FieldDescription>
                A dedicated checkout applies only to this review. Other
                processes can still edit it.
              </FieldDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || loadingWorktrees}
                onClick={() => void loadWorktrees()}
              >
                {loadingWorktrees
                  ? "Loading worktrees…"
                  : worktrees
                    ? "Refresh worktrees"
                    : "Load worktrees"}
              </Button>
              {worktrees?.length === 0 && (
                <FieldDescription>
                  No linked worktrees are available.
                </FieldDescription>
              )}
              {(workspaceError || invalidWorktree) && (
                <FieldError>
                  {workspaceError ??
                    "The selected worktree is unavailable. Choose another workspace."}
                </FieldError>
              )}
            </Field>
          )}
          <Field data-invalid={invalidModel}>
            <FieldLabel id={`${id}-model`}>Reviewer model</FieldLabel>
            <ToggleGroup
              className="max-w-full flex-wrap"
              variant="outline"
              size="sm"
              value={[modelSource]}
              disabled={saving}
              aria-labelledby={`${id}-model`}
              onValueChange={(values) => {
                if (values[0]) setModelSource(String(values[0]));
              }}
            >
              <ToggleGroupItem value="chat">Use chat settings</ToggleGroupItem>
              <ToggleGroupItem value="profile">Saved profile</ToggleGroupItem>
              <ToggleGroupItem value="custom">
                Choose separately
              </ToggleGroupItem>
            </ToggleGroup>
            {modelSource === "custom" && (
              <ChatModelControl
                models={models}
                disabled={saving}
                label="Reviewer model and thinking"
              />
            )}
            <FieldDescription>
              {modelSource === "chat"
                ? "Captures the chat’s saved model and thinking when scheduled."
                : "This choice applies only to the review."}
            </FieldDescription>
            {invalidModel && (
              <FieldError>
                {models.error ??
                  (models.loaded
                    ? "Choose an available favorite model."
                    : "Loading models…")}
              </FieldError>
            )}
          </Field>
          {modelSource === "profile" && (
            <Field data-invalid={invalidProfile}>
              <FieldLabel htmlFor={`${id}-profile`}>
                Saved reviewer profile
              </FieldLabel>
              <Select
                value={profileId ?? null}
                disabled={saving}
                onValueChange={(value) => {
                  if (value) setSelectedProfileId(value);
                }}
              >
                <SelectTrigger
                  id={`${id}-profile`}
                  aria-invalid={invalidProfile}
                >
                  <SelectValue>
                    {profile?.name ?? "Choose a profile"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {profiles.snapshot?.profiles.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {profile && (
                <FieldDescription>
                  {profile.model.modelId} ·{" "}
                  {profile.thinkingLevel ?? "Model default"} ·{" "}
                  {profile.maxTurns} rounds per pass · {profile.passes ?? 1}{" "}
                  passes. {profile.instructions}
                </FieldDescription>
              )}
              {invalidProfile && (
                <FieldError>
                  {profiles.error ??
                    "Choose an available profile. Manage profiles in Machine settings → Reviewer profiles."}
                </FieldError>
              )}
            </Field>
          )}
          {modelSource !== "profile" && (
            <Field data-invalid={invalidTurns}>
              <FieldLabel htmlFor={`${id}-turns`}>Review turn limit</FieldLabel>
              <Input
                id={`${id}-turns`}
                type="number"
                min={1}
                max={50}
                step={1}
                value={turnLimit}
                disabled={saving}
                aria-invalid={invalidTurns}
                aria-describedby={`${id}-turns-help`}
                onChange={(event) => setTurnLimit(event.target.value)}
              />
              <FieldDescription id={`${id}-turns-help`}>
                1–50 model rounds per pass. Reaching this limit stops the
                review.
              </FieldDescription>
              {invalidTurns && (
                <FieldError>Enter a whole number from 1 to 50.</FieldError>
              )}
            </Field>
          )}
          {modelSource !== "profile" && (
            <Field data-invalid={invalidPasses}>
              <FieldLabel htmlFor={`${id}-passes`}>Review passes</FieldLabel>
              <Input
                id={`${id}-passes`}
                type="number"
                min={1}
                max={5}
                step={1}
                value={passes}
                disabled={saving}
                aria-invalid={invalidPasses}
                aria-describedby={`${id}-passes-help`}
                onChange={(event) => setPasses(event.target.value)}
              />
              <FieldDescription id={`${id}-passes-help`}>
                1–5 passes. Extra passes recheck findings; all share the session
                token budget. Only the final report is delivered.
              </FieldDescription>
              {invalidPasses && (
                <FieldError>Enter a whole number from 1 to 5.</FieldError>
              )}
            </Field>
          )}
          <Field data-invalid={invalidOccurrences}>
            <FieldLabel htmlFor={`${id}-occurrences`}>Total reviews</FieldLabel>
            <Input
              id={`${id}-occurrences`}
              type="number"
              min={1}
              max={1000}
              step={1}
              value={occurrences}
              disabled={saving}
              aria-invalid={invalidOccurrences}
              aria-describedby={`${id}-occurrences-help`}
              onChange={(event) => setOccurrences(event.target.value)}
            />
            <FieldDescription id={`${id}-occurrences-help`}>
              1 runs once. 2–1000 schedules recurring reviews, including the
              first review.
            </FieldDescription>
            {invalidOccurrences && (
              <FieldError>Enter a whole number from 1 to 1000.</FieldError>
            )}
          </Field>
          {repeating && (
            <Field data-invalid={invalidInterval}>
              <FieldLabel htmlFor={`${id}-interval`}>
                Interval in minutes
              </FieldLabel>
              <Input
                id={`${id}-interval`}
                type="number"
                min={1}
                max={525600}
                step={1}
                value={intervalMinutes}
                disabled={saving}
                aria-invalid={invalidInterval}
                aria-describedby={`${id}-interval-help`}
                onChange={(event) => setIntervalMinutes(event.target.value)}
              />
              <FieldDescription id={`${id}-interval-help`}>
                Wait after each completed review. Reviews never overlap or catch
                up missed intervals. A failed review stops the schedule; each
                occurrence uses the selected delivery and shares the session
                token budget.
              </FieldDescription>
              {invalidInterval && (
                <FieldError>Enter a whole number from 1 to 525600.</FieldError>
              )}
            </Field>
          )}
          <Field data-invalid={invalidTime}>
            <FieldLabel htmlFor={`${id}-when`}>Start time</FieldLabel>
            <Input
              id={`${id}-when`}
              type="datetime-local"
              value={when}
              disabled={saving}
              aria-describedby={`${id}-when-help`}
              aria-invalid={invalidTime}
              onChange={(event) => setWhen(event.target.value)}
            />
            <FieldDescription id={`${id}-when-help`}>
              Uses your local time. Leave blank to start now.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel id={`${id}-delivery`}>Result delivery</FieldLabel>
            <ToggleGroup
              className="max-w-full flex-wrap"
              variant="outline"
              size="sm"
              value={[resultDelivery]}
              disabled={saving}
              aria-labelledby={`${id}-delivery`}
              onValueChange={(values) => {
                if (values[0]) setResultDelivery(String(values[0]));
              }}
            >
              <ToggleGroupItem value="display">Display</ToggleGroupItem>
              <ToggleGroupItem value="context">Context</ToggleGroupItem>
              <ToggleGroupItem value="followUp">Follow up</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {resultDelivery === "display"
                ? "Show findings only."
                : resultDelivery === "context"
                  ? "Include findings in the next model request without starting a run."
                  : "Start a parent response when findings arrive, or queue it after current work."}
            </FieldDescription>
          </Field>
        </FieldGroup>
        {message && (
          <p role={message.error ? "alert" : "status"}>{message.text}</p>
        )}
      </InspectorSectionContent>
      <InspectorSectionActions>
        <Button
          size="xs"
          disabled={saving || invalid || !brief.trim()}
          onClick={() => void schedule()}
        >
          {saving
            ? "Scheduling…"
            : repeating
              ? "Schedule recurring reviews"
              : at === undefined
                ? "Start review"
                : "Schedule review"}
        </Button>
      </InspectorSectionActions>
    </InspectorSection>
  );
}

export function PostRunSettings({
  value,
  repairLimit,
  disabled,
  save,
}: {
  value: string | null;
  repairLimit: number;
  disabled: boolean;
  save: (command: string | null, repairLimit: number) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{
    value: string;
    original: string | null;
    limit: string;
    originalLimit: number;
  }>();
  const command = draft?.value ?? value ?? "";
  const limit = draft?.limit ?? String(repairLimit);
  const invalidLimit = !/^\d+$/.test(limit) || Number(limit) > 5;
  const stale =
    !!draft &&
    (draft.original !== value || draft.originalLimit !== repairLimit);
  return (
    <InspectorSection>
      <InspectorSectionHeader>
        <InspectorSectionTitle>Post-run check</InspectorSectionTitle>
        <InspectorSectionDescription>
          Run a check after file edits, shell commands, or MCP calls.
        </InspectorSectionDescription>
      </InspectorSectionHeader>
      <InspectorSectionContent>
        <FieldGroup>
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
                  limit,
                  originalLimit: draft?.originalLimit ?? repairLimit,
                })
              }
            />
            <FieldDescription id={`${id}-help`}>
              Runs in the workspace with the backend user’s access. Leave blank
              to disable.
            </FieldDescription>
            {stale && (
              <FieldError>
                The saved command changed elsewhere. Discard your draft.
              </FieldError>
            )}
          </Field>
          <Field data-invalid={invalidLimit} data-disabled={disabled}>
            <FieldLabel htmlFor={`${id}-repairs`}>
              Automatic repair attempts
            </FieldLabel>
            <Input
              id={`${id}-repairs`}
              type="number"
              min={0}
              max={5}
              step={1}
              value={limit}
              disabled={disabled}
              aria-invalid={invalidLimit}
              aria-describedby={`${id}-repairs-help`}
              onChange={(event) =>
                setDraft({
                  value: command,
                  original: draft ? draft.original : value,
                  limit: event.target.value,
                  originalLimit: draft?.originalLimit ?? repairLimit,
                })
              }
            />
            <FieldDescription id={`${id}-repairs-help`}>
              0 reports results only. 1–5 lets the assistant fix failures and
              rerun the check, using this chat’s tools and token budget.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </InspectorSectionContent>
      {draft &&
        (command.trim() !== (value ?? "") ||
          Number(limit) !== repairLimit ||
          stale) && (
          <InspectorSectionActions className="justify-end gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setDraft(undefined)}
            >
              Discard changes
            </Button>
            <Button
              size="xs"
              disabled={disabled || stale || invalidLimit}
              onClick={async () => {
                if (await save(command.trim() || null, Number(limit)))
                  setDraft(undefined);
              }}
            >
              Save check
            </Button>
          </InspectorSectionActions>
        )}
    </InspectorSection>
  );
}

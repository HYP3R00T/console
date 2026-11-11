"use client";

import type {
  WorkflowDefinition,
  WorkflowRunView,
  WorkflowStep,
  WorkflowVersion,
} from "@console/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import type { Session } from "@/components/sessions/use-project-sessions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { BackendClient } from "@/lib/backend/client";

function Choice({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Workflow operation failed.";

export function ProjectWorkflows({
  projectId,
  deviceId,
  sessions,
}: {
  projectId: string;
  deviceId: string;
  sessions?: Session[];
}) {
  const { client } = useConnection(deviceId);
  const [workflows, setWorkflows] = useState<WorkflowVersion[]>([]);
  const [runs, setRuns] = useState<WorkflowRunView[]>([]);
  const [editing, setEditing] = useState<WorkflowVersion>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("{}");
  const admissions = useRef(new Map<string, string>());
  const base = `/v1/projects/${encodeURIComponent(projectId)}`;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!client) return;
      const [catalog, history] = await Promise.all([
        client.request<{ workflows: WorkflowVersion[]; triggerError?: string }>(
          `${base}/workflows`,
          { signal },
        ),
        client.request<{ runs: WorkflowRunView[] }>(`${base}/workflow-runs`, {
          signal,
        }),
      ]);
      if (signal?.aborted) return;
      setWorkflows(catalog.workflows);
      setRuns(history.runs);
      if (catalog.triggerError) setError(catalog.triggerError);
    },
    [client, base],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        await load(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) setError(errorText(error));
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void refresh(), 2000);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load]);
  if (!client) return null;
  async function perform(operation: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
      await load();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label="Project workflows"
    >
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Workflows</h2>
        <Button
          variant="outline"
          disabled={busy || !sessions?.length}
          onClick={() => {
            const first = sessions?.[0];
            setEditing({
              id: crypto.randomUUID(),
              projectId,
              version: 0,
              enabled: false,
              sessionId: first?.session.sessionId ?? "",
              conversationId: String(first?.conversations[0]?.id ?? ""),
              definition: {
                name: "New workflow",
                steps: [
                  { id: "step_1", type: "agent", instructions: "", next: null },
                ],
              },
            });
          }}
        >
          New workflow
        </Button>
      </div>
      {!workflows.length && (
        <p className="text-sm text-muted-foreground">
          Create a workflow to connect agent steps, conditions and approvals.
        </p>
      )}
      {workflows.map((workflow) => (
        <div key={workflow.id} className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setEditing(workflow)}>
            {workflow.definition.name}
          </Button>
          <span className="text-xs text-muted-foreground">
            Version {workflow.version} ·{" "}
            {workflow.enabled ? "Triggers enabled" : "Manual"}
          </span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const parsed = JSON.parse(input);
                if (
                  !parsed ||
                  Array.isArray(parsed) ||
                  typeof parsed !== "object" ||
                  Object.values(parsed).some(
                    (value) => typeof value !== "string",
                  )
                )
                  throw new Error(
                    "Run inputs must be a JSON object with string values.",
                  );
                const key = `${workflow.id}:${workflow.version}:${input}`;
                const requestId =
                  admissions.current.get(key) ?? crypto.randomUUID();
                admissions.current.set(key, requestId);
                await client.request(`${base}/workflows/${workflow.id}/runs`, {
                  method: "POST",
                  body: JSON.stringify({ requestId, input: parsed }),
                });
                admissions.current.delete(key);
              })
            }
          >
            Run
          </Button>
        </div>
      ))}
      {!!workflows.length && (
        <Field>
          <FieldLabel htmlFor="workflow-input">Run inputs</FieldLabel>
          <Textarea
            id="workflow-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
          />
          <FieldDescription>
            JSON string values referenced as {"{{input.name}}"} in steps.
          </FieldDescription>
        </Field>
      )}
      {editing && (
        <WorkflowEditor
          key={editing.id}
          workflow={editing}
          sessions={sessions ?? []}
          client={client}
          onSaved={async (saved) => {
            setEditing(saved);
            await load();
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
      {runs.map((run) => (
        <div
          key={`${run.sessionId}:${run.id}`}
          className="flex flex-col gap-2 border-t pt-3"
        >
          <p className="text-sm">
            {workflows.find((workflow) => workflow.id === run.workflowId)
              ?.definition.name ?? "Workflow"}{" "}
            · Version {run.version} · {run.status}
            {run.step ? ` · ${run.step}` : ""}
          </p>
          {Object.entries(run.outputs).map(([step, text]) => (
            <details key={step}>
              <summary className="text-xs">{step} output</summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                {text}
              </pre>
            </details>
          ))}
          {!!run.decisions?.length && (
            <details>
              <summary className="text-xs">Approval history</summary>
              {run.decisions.map((decision) => (
                <div
                  key={decision.revision}
                  className="flex flex-col gap-1 py-2 text-xs"
                >
                  <p>
                    {decision.step} · {decision.decision} ·{" "}
                    {new Date(decision.at).toLocaleString()} · {decision.actor}
                  </p>
                  {decision.merge && (
                    <pre className="overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(decision.merge, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </details>
          )}
          {run.error && (
            <p role="alert" className="text-sm text-destructive">
              {run.error}
            </p>
          )}
          {run.status === "approval" && run.approval && (
            <div className="flex flex-col gap-2">
              <p className="whitespace-pre-wrap text-sm">
                {run.approval.message}
              </p>
              {run.approval.action?.merge && (
                <pre className="overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(run.approval.action.merge, null, 2)}
                </pre>
              )}
              {run.approval.invalidated && (
                <p className="text-sm text-destructive">
                  {run.approval.invalidated}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {(["approved", "rejected"] as const).map((decision) => (
                  <Button
                    key={decision}
                    variant={decision === "approved" ? "default" : "outline"}
                    disabled={busy || !!run.approval?.decision}
                    onClick={() =>
                      void perform(() =>
                        client.request(
                          `${base}/workflow-runs/${run.sessionId}/${run.id}/decision`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              revision: run.approval?.revision,
                              decision,
                            }),
                          },
                        ),
                      )
                    }
                  >
                    {decision === "approved" ? "Approve action" : "Reject"}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  disabled={busy || !!run.approval.decision}
                  onClick={() =>
                    void perform(() =>
                      client.request(
                        `${base}/workflow-runs/${run.sessionId}/${run.id}/invalidate`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            revision: run.approval?.revision,
                          }),
                        },
                      ),
                    )
                  }
                >
                  Invalidate previous revision
                </Button>
              </div>
            </div>
          )}
          {!["completed", "failed", "aborted", "faulted", "orphaned"].includes(
            run.status,
          ) && (
            <Button
              variant="outline"
              className="self-start"
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  client.request(
                    `${base}/workflow-runs/${run.sessionId}/${run.id}`,
                    { method: "DELETE" },
                  ),
                )
              }
            >
              Stop workflow
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function WorkflowEditor({
  workflow,
  sessions,
  client,
  onSaved,
  onClose,
}: {
  workflow: WorkflowVersion;
  sessions: Session[];
  client: BackendClient;
  onSaved: (workflow: WorkflowVersion) => Promise<void>;
  onClose: () => void;
}) {
  const [definition, setDefinition] = useState(workflow.definition);
  const [revision, setRevision] = useState(workflow.version);
  const [target, setTarget] = useState(
    `${workflow.sessionId}/${workflow.conversationId}`,
  );
  const [enabled, setEnabled] = useState(workflow.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  function change(value: WorkflowDefinition) {
    setDefinition(value);
    setSaved(false);
  }
  function replace(index: number, step: WorkflowStep) {
    change({
      ...definition,
      steps: definition.steps.map((current, i) =>
        i === index ? step : current,
      ),
    });
  }
  const destinations = (index: number) => [
    { value: "finish", label: "Finish" },
    ...definition.steps
      .slice(index + 1)
      .map((step) => ({ value: step.id, label: step.id })),
  ];
  return (
    <form
      className="flex min-w-0 flex-col gap-4 border-t pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);
        setSaved(false);
        try {
          const [sessionId, conversationId] = target.split("/");
          const saved = await client.request<WorkflowVersion>(
            `/v1/projects/${workflow.projectId}/workflows/${workflow.id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                revision,
                definition,
                sessionId,
                conversationId,
                enabled,
              }),
            },
          );
          setRevision(saved.version);
          await onSaved(saved);
          setSaved(true);
        } catch (error) {
          setError(errorText(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="workflow-name">Workflow name</FieldLabel>
          <Input
            id="workflow-name"
            required
            maxLength={120}
            value={definition.name}
            onChange={(event) =>
              change({ ...definition, name: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel>Execution conversation</FieldLabel>
          <Choice
            label="Execution conversation"
            value={target}
            onChange={setTarget}
            options={sessions.flatMap(({ session, conversations }) =>
              conversations.map((conversation) => ({
                value: `${session.sessionId}/${conversation.id}`,
                label: `${session.name} / ${conversation.name}`,
              })),
            )}
          />
          <FieldDescription>
            Copies this conversation’s model, tools and workspace when each run
            starts.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {definition.steps.map((step, index) => (
        <fieldset
          key={step.id}
          className="flex min-w-0 flex-col gap-3 border-t pt-3"
        >
          <legend className="text-sm font-medium">{step.id}</legend>
          <FieldGroup>
            <Field>
              <FieldLabel>Step type</FieldLabel>
              <Choice
                label={`${step.id} type`}
                value={step.type}
                options={[
                  { value: "agent", label: "Agent" },
                  { value: "condition", label: "Condition" },
                  { value: "approval", label: "Approval" },
                ]}
                onChange={(value) => {
                  const next = definition.steps[index + 1]?.id ?? null;
                  replace(
                    index,
                    value === "agent"
                      ? { id: step.id, type: "agent", instructions: "", next }
                      : value === "approval"
                        ? {
                            id: step.id,
                            type: "approval",
                            message:
                              "Review the previous outputs before continuing.",
                            next,
                          }
                        : {
                            id: step.id,
                            type: "condition",
                            source:
                              definition.steps
                                .slice(0, index)
                                .findLast((prior) => prior.type === "agent")
                                ?.id ?? "",
                            contains: "",
                            yes: next,
                            no: null,
                          },
                  );
                }}
              />
            </Field>
            {step.type === "agent" && (
              <Field>
                <FieldLabel htmlFor={`${step.id}-instructions`}>
                  Instructions
                </FieldLabel>
                <Textarea
                  id={`${step.id}-instructions`}
                  required
                  maxLength={32000}
                  value={step.instructions}
                  onChange={(event) =>
                    replace(index, {
                      ...step,
                      instructions: event.target.value,
                    })
                  }
                />
                <FieldDescription>
                  Use {"{{input.name}}"} and {"{{steps.step_1}}"} for inputs and
                  previous outputs.
                </FieldDescription>
              </Field>
            )}
            {step.type === "approval" && (
              <>
                <Field>
                  <FieldLabel htmlFor={`${step.id}-message`}>
                    Approval request
                  </FieldLabel>
                  <Textarea
                    id={`${step.id}-message`}
                    required
                    maxLength={32000}
                    value={step.message}
                    onChange={(event) =>
                      replace(index, { ...step, message: event.target.value })
                    }
                  />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id={`${step.id}-merge`}
                    checked={!!step.merge}
                    onCheckedChange={(checked) =>
                      replace(index, {
                        ...step,
                        ...(checked
                          ? {
                              merge: {
                                owner: "",
                                repository: "",
                                number: "{{input.number}}",
                                sha: "{{input.sha}}",
                                method: "squash",
                              },
                            }
                          : { merge: undefined }),
                      })
                    }
                  />
                  <FieldLabel htmlFor={`${step.id}-merge`}>
                    Merge a GitHub pull request after approval
                  </FieldLabel>
                </Field>
                {step.merge && (
                  <>
                    {(["owner", "repository", "number", "sha"] as const).map(
                      (key) => (
                        <Field key={key}>
                          <FieldLabel htmlFor={`${step.id}-${key}`}>
                            {key === "sha"
                              ? "Full head commit SHA"
                              : key === "number"
                                ? "Pull request number"
                                : key === "owner"
                                  ? "Repository owner"
                                  : "Repository name"}
                          </FieldLabel>
                          <Input
                            id={`${step.id}-${key}`}
                            required
                            value={step.merge?.[key] ?? ""}
                            onChange={(event) => {
                              if (step.merge)
                                replace(index, {
                                  ...step,
                                  merge: {
                                    ...step.merge,
                                    [key]: event.target.value,
                                  },
                                });
                            }}
                          />
                        </Field>
                      ),
                    )}
                    <Field>
                      <FieldLabel>Merge method</FieldLabel>
                      <Choice
                        label="Merge method"
                        value={step.merge.method}
                        options={["merge", "squash", "rebase"].map((value) => ({
                          value,
                          label: value,
                        }))}
                        onChange={(value) => {
                          if (step.merge)
                            replace(index, {
                              ...step,
                              merge: {
                                ...step.merge,
                                method: value as "merge" | "squash" | "rebase",
                              },
                            });
                        }}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            {step.type === "condition" && (
              <>
                <Field>
                  <FieldLabel>Read output from</FieldLabel>
                  <Choice
                    label={`${step.id} source`}
                    value={step.source}
                    options={definition.steps
                      .slice(0, index)
                      .filter((prior) => prior.type === "agent")
                      .map((prior) => ({ value: prior.id, label: prior.id }))}
                    onChange={(source) => replace(index, { ...step, source })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${step.id}-contains`}>
                    Contains text
                  </FieldLabel>
                  <Input
                    id={`${step.id}-contains`}
                    value={step.contains}
                    onChange={(event) =>
                      replace(index, { ...step, contains: event.target.value })
                    }
                  />
                </Field>
                {(["yes", "no"] as const).map((key) => (
                  <Field key={key}>
                    <FieldLabel>
                      {key === "yes" ? "When matched" : "Otherwise"}
                    </FieldLabel>
                    <Choice
                      label={`${step.id} ${key}`}
                      value={step[key] ?? "finish"}
                      options={destinations(index)}
                      onChange={(value) =>
                        replace(index, {
                          ...step,
                          [key]: value === "finish" ? null : value,
                        })
                      }
                    />
                  </Field>
                ))}
              </>
            )}
            {step.type !== "condition" && (
              <Field>
                <FieldLabel>Next step</FieldLabel>
                <Choice
                  label={`${step.id} next`}
                  value={step.next ?? "finish"}
                  options={destinations(index)}
                  onChange={(value) =>
                    replace(index, {
                      ...step,
                      next: value === "finish" ? null : value,
                    })
                  }
                />
              </Field>
            )}
          </FieldGroup>
          <Button
            variant="ghost"
            type="button"
            className="self-start"
            disabled={definition.steps.length <= 1}
            onClick={() => {
              const next = definition.steps[index + 1]?.id ?? null;
              change({
                ...definition,
                steps: definition.steps
                  .filter((current) => current.id !== step.id)
                  .map((current) =>
                    current.type === "condition"
                      ? {
                          ...current,
                          yes: current.yes === step.id ? next : current.yes,
                          no: current.no === step.id ? next : current.no,
                        }
                      : {
                          ...current,
                          next: current.next === step.id ? next : current.next,
                        },
                  ),
              });
            }}
          >
            Remove step
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        type="button"
        className="self-start"
        disabled={definition.steps.length >= 50}
        onClick={() => {
          const id = `step_${crypto.randomUUID().slice(0, 8)}`;
          const steps = definition.steps.map((step, index) =>
            index === definition.steps.length - 1 &&
            step.type !== "condition" &&
            step.next === null
              ? { ...step, next: id }
              : step,
          );
          change({
            ...definition,
            steps: [
              ...steps,
              { id, type: "agent", instructions: "", next: null },
            ],
          });
        }}
      >
        Add step
      </Button>
      <FieldGroup>
        <Field>
          <FieldLabel>Trigger</FieldLabel>
          <Choice
            label="Workflow trigger"
            value={definition.trigger?.type ?? "manual"}
            options={[
              { value: "manual", label: "Manual" },
              { value: "cron", label: "Schedule" },
              { value: "github", label: "GitHub webhook" },
            ]}
            onChange={(type) =>
              change({
                ...definition,
                trigger:
                  type === "manual"
                    ? undefined
                    : type === "cron"
                      ? {
                          type: "cron",
                          expression: "0 9 * * *",
                          timezone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                        }
                      : {
                          type: "github",
                          repository: "",
                          event: "issues",
                          action: "opened",
                        },
              })
            }
          />
        </Field>
        {definition.trigger?.type === "cron" && (
          <>
            {(["expression", "timezone"] as const).map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`workflow-${key}`}>
                  {key === "expression"
                    ? "Cron expression (five fields)"
                    : "IANA timezone"}
                </FieldLabel>
                <Input
                  id={`workflow-${key}`}
                  required
                  value={
                    definition.trigger?.type === "cron"
                      ? definition.trigger[key]
                      : ""
                  }
                  onChange={(event) => {
                    if (definition.trigger?.type === "cron")
                      change({
                        ...definition,
                        trigger: {
                          ...definition.trigger,
                          [key]: event.target.value,
                        },
                      });
                  }}
                />
              </Field>
            ))}
            <p className="text-xs text-muted-foreground">
              Runs once after missed schedules. Overlapping occurrences are
              skipped.
            </p>
          </>
        )}
        {definition.trigger?.type === "github" && (
          <>
            {(["repository", "event", "action"] as const).map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`workflow-${key}`}>
                  {key === "repository"
                    ? "Repository (owner/name)"
                    : key === "event"
                      ? "Event (issues or pull_request)"
                      : "Action (for example opened)"}
                </FieldLabel>
                <Input
                  id={`workflow-${key}`}
                  required
                  value={
                    definition.trigger?.type === "github"
                      ? definition.trigger[key]
                      : ""
                  }
                  onChange={(event) => {
                    if (definition.trigger?.type === "github")
                      change({
                        ...definition,
                        trigger: {
                          ...definition.trigger,
                          [key]: event.target.value,
                        },
                      });
                  }}
                />
              </Field>
            ))}
            <p className="wrap-anywhere text-xs text-muted-foreground">
              Webhook path {`/v1/hooks/github/${workflow.projectId}`}. The
              backend owner configures its signing secret.
            </p>
          </>
        )}
        {definition.trigger && (
          <Field orientation="horizontal">
            <Checkbox
              id="workflow-enabled"
              checked={enabled}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                setSaved(false);
              }}
            />
            <FieldLabel htmlFor="workflow-enabled">Enable trigger</FieldLabel>
          </Field>
        )}
      </FieldGroup>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save version"}
        </Button>
        <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
          Close editor
        </Button>
      </div>
      {saved && (
        <p role="status" className="text-xs text-muted-foreground">
          Saved version {revision}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

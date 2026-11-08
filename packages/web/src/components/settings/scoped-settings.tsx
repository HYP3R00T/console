"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useBackendCommands } from "@/components/commands/backend-commands";
import { useCommands } from "@/components/commands/command-registry";
import { InspectorRuntimePolicy } from "@/components/sessions/inspector-runtime-policy";
import type { RuntimePolicy } from "@/components/sessions/runtime-policy-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBackendRequest } from "@/hooks/use-backend-request";
import type { BackendCommandId } from "@/lib/backend/commands";

type Scope = "machine" | "project" | "session";
type Snapshot = {
  revision: string;
  values: Record<string, unknown>;
  tools?: string[];
  defaults?: Record<string, string>;
};
const commands = {
  machine: "machine.workspace-guidance.update",
  project: "project.agent-settings.update",
  session: "session.runtime-settings.update",
} as const satisfies Record<Scope, BackendCommandId>;
export type ScopedSettingsTarget = {
  deviceId: string;
  projectId?: string;
  sessionId?: string;
};
export function ScopedSettings({
  scope,
  target,
  embedded = false,
}: {
  scope: Scope;
  target?: ScopedSettingsTarget;
  embedded?: boolean;
}) {
  const params = useParams<{
    deviceId: string;
    projectId?: string;
    sessionId?: string;
  }>();
  const resolved = target ?? params;
  return (
    <SettingsForm
      key={`${resolved.deviceId}:${scope}:${resolved.projectId}:${resolved.sessionId}`}
      scope={scope}
      target={resolved}
      embedded={embedded}
    />
  );
}
function SettingsForm({
  scope,
  target,
  embedded,
}: {
  scope: Scope;
  target: ScopedSettingsTarget;
  embedded: boolean;
}) {
  const { projectId, sessionId } = target;
  const { client, request } = useBackendRequest();
  const discovery = useBackendCommands(),
    registry = useCommands();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [draft, setDraft] = useState<{
    revision: string;
    values: Record<string, unknown>;
  }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const [refresh, setRefresh] = useState(0);
  const command = commands[scope];
  const path =
    scope === "machine"
      ? "/v1/machine/workspace-guidance"
      : scope === "project"
        ? `/v1/projects/${encodeURIComponent(projectId ?? "")}/agent-settings`
        : `/v1/sessions/${encodeURIComponent(sessionId ?? "")}/runtime-settings`;
  const supported = discovery.supports(command);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly reloads the current scope after discarding edits.
  useEffect(() => {
    if (!client || !supported) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const version = generation.current;
      try {
        const next = await request<Snapshot>(path, {
          signal: controller.signal,
        });
        if (
          !controller.signal.aborted &&
          !saving.current &&
          version === generation.current
        ) {
          setSnapshot(next);
          setError(undefined);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Could not load settings.",
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 5000);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, request, path, supported, refresh]);
  const values = draft?.values ?? snapshot?.values ?? {};
  const stale = !!draft && draft.revision !== snapshot?.revision;
  function edit(key: string, value: unknown) {
    if (snapshot)
      setDraft((current) => ({
        revision: current?.revision ?? snapshot.revision,
        values: { ...(current?.values ?? snapshot.values), [key]: value },
      }));
  }
  async function save(changes: Record<string, unknown>) {
    if (!snapshot || saving.current || stale) return false;
    saving.current = true;
    generation.current++;
    setBusy(true);
    setError(undefined);
    try {
      const next = (await registry.invoke(command, {
        revision: draft?.revision ?? snapshot.revision,
        ...changes,
      })) as Snapshot;
      setSnapshot(next);
      setDraft(undefined);
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save settings.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function textField(key: string, label: string, description: string) {
    return (
      <Field key={key}>
        <FieldLabel htmlFor={`${scope}-${key}`}>{label}</FieldLabel>
        <Textarea
          id={`${scope}-${key}`}
          maxLength={16000}
          value={String(values[key] ?? "")}
          placeholder={snapshot?.defaults?.[key]}
          disabled={busy}
          onChange={(event) => edit(key, event.target.value || null)}
        />
        <FieldDescription>{description}</FieldDescription>
      </Field>
    );
  }
  return (
    <section
      className="flex max-w-2xl flex-col gap-5"
      aria-label={`${scope} settings`}
    >
      <header>
        <h2
          className={
            embedded ? "text-sm font-semibold" : "text-xl font-semibold"
          }
        >
          {scope === "machine"
            ? "Workspace guidance"
            : scope === "project"
              ? "Project agent settings"
              : "Session runtime settings"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {scope === "machine"
            ? "Backend-owned. Guidance is shared across all projects and conversations on this machine."
            : scope === "project"
              ? "Backend-owned. Instructions and evidence rules apply across this project; default tools apply only to new conversations."
              : "Backend-owned. Applies to every conversation, fork, reviewer and worker in this session. Token budgets can change during work; other runtime edits require an idle session."}
        </p>
      </header>
      {!client ? (
        <p>Connect this machine first.</p>
      ) : discovery.status === "error" ? (
        <Button variant="outline" onClick={discovery.retry}>
          Retry command discovery
        </Button>
      ) : discovery.status === "legacy" ||
        (discovery.status === "ready" && !discovery.supports(command)) ? (
        <p>
          This backend does not support scoped settings. Use the conversation
          inspector.
        </p>
      ) : !snapshot ? (
        <p role="status">Loading settings…</p>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft || stale) return;
              const changes = Object.fromEntries(
                Object.entries(draft.values).filter(
                  ([key, value]) =>
                    JSON.stringify(value) !==
                    JSON.stringify(snapshot.values[key]),
                ),
              );
              if (Object.keys(changes).length) void save(changes);
            }}
          >
            <FieldGroup>
              {scope === "machine" &&
                textField(
                  "workspaceGuidance",
                  "Machine workspace guidance",
                  "Blank restores the built-in guidance. Execution facts remain runtime-owned.",
                )}
              {scope === "project" && (
                <>
                  {textField(
                    "projectInstructions",
                    "Shared project instructions",
                    "Separate from AGENTS.md. Blank clears these instructions.",
                  )}
                  {textField(
                    "inspectionGuidance",
                    "Project evidence rules",
                    "Blank restores built-in evidence guidance.",
                  )}
                  <Field>
                    <FieldLabel htmlFor="project-tools">
                      Default tool names
                    </FieldLabel>
                    <Textarea
                      id="project-tools"
                      value={
                        values.projectTools === null
                          ? ""
                          : ((values.projectTools as string[]) ?? []).join("\n")
                      }
                      disabled={busy}
                      onChange={(event) =>
                        edit(
                          "projectTools",
                          event.target.value.trim()
                            ? event.target.value.split(/\s+/).filter(Boolean)
                            : null,
                        )
                      }
                    />
                    <FieldDescription>
                      One tool per line. Blank enables built-in defaults;
                      existing conversation selections are unchanged. Available:{" "}
                      {snapshot.tools?.join(", ")}
                    </FieldDescription>
                    <Button
                      type="button"
                      variant="outline"
                      className="self-start"
                      disabled={busy}
                      onClick={() => edit("projectTools", [])}
                    >
                      Disable all default tools
                    </Button>
                  </Field>
                </>
              )}
              {scope === "session" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="session-budget">
                      Session token budget
                    </FieldLabel>
                    <Input
                      id="session-budget"
                      type="number"
                      min={1}
                      step={1}
                      value={(values.tokenBudget as number) ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        edit(
                          "tokenBudget",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                    <FieldDescription>
                      Blank clears the shared threshold. In-flight requests can
                      overshoot it.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="session-compaction">
                      Automatic compaction
                    </FieldLabel>
                    <select
                      id="session-compaction"
                      className="rounded-md border border-input bg-background p-2"
                      value={String(values.automaticCompaction)}
                      disabled={busy}
                      onChange={(event) =>
                        edit(
                          "automaticCompaction",
                          event.target.value === "true",
                        )
                      }
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="session-retention">
                      Recent tokens to retain
                    </FieldLabel>
                    <Input
                      id="session-retention"
                      type="number"
                      min={1000}
                      max={32000}
                      step={1000}
                      value={(values.keepRecentTokens as number) ?? 1000}
                      disabled={busy}
                      onChange={(event) =>
                        edit("keepRecentTokens", Number(event.target.value))
                      }
                    />
                  </Field>
                </>
              )}
            </FieldGroup>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !draft || stale}>
                {busy ? "Saving…" : "Save settings"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDraft(undefined);
                  setRefresh((value) => value + 1);
                }}
              >
                Discard edits and refresh
              </Button>
            </div>
          </form>
          {scope === "session" && (
            <InspectorRuntimePolicy
              value={(snapshot.values.runtimePolicy ?? {}) as RuntimePolicy}
              disabled={busy || !!draft}
              save={(runtimePolicy) => save({ runtimePolicy })}
            />
          )}
        </>
      )}
      {stale && (
        <p role="alert" className="text-sm text-destructive">
          Settings changed elsewhere. Discard edits and refresh before saving.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

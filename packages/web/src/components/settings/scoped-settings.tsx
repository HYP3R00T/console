"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useBackendCommands } from "@/components/commands/backend-commands";
import { useCommands } from "@/components/commands/command-registry";
import { RuntimePolicyFields } from "@/components/sessions/inspector-runtime-policy";
import type { RuntimePolicy } from "@/components/sessions/runtime-policy-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useBackendRequest } from "@/hooks/use-backend-request";
import type { BackendCommandId } from "@/lib/backend/commands";
import {
  type RuntimePolicyDraft,
  resetRuntimePolicyDraft,
  runtimePolicyDraftInvalid,
  runtimePolicyDraftValue,
} from "@/lib/runtime-policy-draft";
import { ProjectDefaultTools } from "./project-default-tools";
import { SettingsDisclosure } from "./settings-presentation";

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
  const [loadError, setLoadError] = useState<string>();
  const [policyDraft, setPolicyDraft] = useState<RuntimePolicyDraft>();
  const [saved, setSaved] = useState(false);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reloads confirmed values while preserving the current draft.
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
          setLoadError(undefined);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setLoadError(
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
  const policyValue = (snapshot?.values.runtimePolicy ?? {}) as RuntimePolicy;
  const policyInvalid =
    scope === "session" && runtimePolicyDraftInvalid(policyValue, policyDraft);
  const changes = Object.fromEntries(
    Object.entries(draft?.values ?? {}).filter(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(snapshot?.values[key]),
    ),
  );
  const hasDraft = !!draft || !!policyDraft;
  function editPolicy(next: RuntimePolicyDraft) {
    setPolicyDraft(next);
    edit(
      "runtimePolicy",
      runtimePolicyDraftInvalid(policyValue, next)
        ? (values.runtimePolicy ?? {})
        : runtimePolicyDraftValue(next),
    );
  }
  function edit(key: string, value: unknown) {
    setSaved(false);
    setError(undefined);
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
      setPolicyDraft(undefined);
      setSaved(true);
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
          rows={3}
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
      className="flex w-full min-w-0 flex-col gap-5"
      aria-label={`${scope} settings`}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2
            className={
              embedded
                ? "text-base font-semibold text-foreground"
                : "text-xl font-semibold text-foreground"
            }
          >
            {scope === "machine"
              ? "Workspace guidance"
              : scope === "project"
                ? "Project guidance"
                : "Session runtime"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-foreground/65">
            {scope === "machine"
              ? "Backend-owned. Guidance is shared across all projects and conversations on this machine."
              : scope === "project"
                ? "Shared across this project’s sessions and conversations."
                : "Shared by this session’s conversations and workers. Budget changes can apply during work; other runtime changes require an idle session."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh
        </Button>
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft || stale || policyInvalid) return;
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
                <SettingsDisclosure title="Tools for new conversations">
                  <ProjectDefaultTools
                    available={snapshot.tools ?? []}
                    selected={
                      Array.isArray(values.projectTools)
                        ? (values.projectTools as string[])
                        : null
                    }
                    disabled={busy}
                    onChange={(value) => edit("projectTools", value)}
                  />
                </SettingsDisclosure>
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
                        event.target.value ? Number(event.target.value) : null,
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
                  <Switch
                    id="session-compaction"
                    checked={values.automaticCompaction === true}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      edit("automaticCompaction", checked)
                    }
                  />
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
          {scope === "session" && (
            <section
              className="mt-8 flex flex-col gap-3"
              aria-label="Execution policies"
            >
              <header>
                <h3 className="text-sm font-semibold text-foreground">
                  Execution policies
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                  Retries, queued input, compaction thresholds and memory.
                  Default values follow the backend.
                </p>
              </header>
              <RuntimePolicyFields
                value={policyValue}
                draft={policyDraft}
                disabled={busy || stale}
                onChange={editPolicy}
              />
              <Button
                className="self-start"
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  busy ||
                  stale ||
                  (!policyDraft && Object.keys(policyValue).length === 0)
                }
                onClick={() => {
                  setPolicyDraft(resetRuntimePolicyDraft(policyValue));
                  edit("runtimePolicy", null);
                }}
              >
                Restore policy defaults
              </Button>
              {policyDraft?.reset && (
                <p role="status" className="text-xs text-foreground/65">
                  Policy defaults staged. Save changes to apply.
                </p>
              )}
            </section>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={
                busy || !Object.keys(changes).length || stale || policyInvalid
              }
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
            {hasDraft && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(undefined);
                  setPolicyDraft(undefined);
                  setError(undefined);
                }}
              >
                Discard changes
              </Button>
            )}
            <span role="status" className="text-xs text-foreground/65">
              {Object.keys(changes).length || policyInvalid
                ? "Unsaved changes"
                : saved
                  ? "Changes saved"
                  : ""}
            </span>
          </div>
        </form>
      )}
      {stale && (
        <p role="alert" className="text-sm text-destructive">
          Settings changed elsewhere. Discard changes to review the latest
          values before saving.
        </p>
      )}
      {(error || loadError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? loadError}
        </p>
      )}
    </section>
  );
}

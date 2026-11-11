"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ComponentProps } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBackendCommands } from "@/components/commands/backend-commands";
import { useCommands } from "@/components/commands/command-registry";
import { SettingsDisclosure } from "@/components/settings/settings-presentation";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { inspectorSectionAvailable } from "@/lib/inspector-availability";
import type {
  InspectorScope,
  InspectorSection as InspectorSectionId,
} from "@/lib/inspector-preferences";
import { inspectorSectionInfo } from "@/lib/inspector-preferences";
import { cn } from "@/lib/utils";
import type { Execution } from "./conversation-state";
import { executionNeedsAttention } from "./execution-labels";
import { ExecutionStatus } from "./execution-status";
import { InspectorAgents } from "./inspector-agents";
import { type ContextSettings, InspectorContext } from "./inspector-context";
import {
  type Guidance,
  InstructionEditor,
  RuntimeGuidance,
} from "./inspector-instructions";
import { InspectorNavigation, InspectorPanel } from "./inspector-navigation";
import { InspectorRuntimePolicy } from "./inspector-runtime-policy";
import {
  InspectorSection,
  InspectorSectionActions,
  InspectorSectionContent,
  InspectorSectionDescription,
  InspectorSectionHeader,
  InspectorSectionTitle,
} from "./inspector-section";
import { InspectorTaskHistory } from "./inspector-task-history";
import {
  InspectorTasks,
  PostRunSettings,
  ScheduleReview,
} from "./inspector-tasks";
import { type InspectorTool, InspectorTools } from "./inspector-tools";
import {
  InspectorWorkspace,
  type RemoteWorkspace,
} from "./inspector-workspace";
import { MessageMarkdown } from "./message-markdown";
import type { RuntimePolicy } from "./runtime-policy-form";
import { ScheduleJob } from "./schedule-job";
import type { ChatModel, ModelRef } from "./use-chat-models";

type Change = {
  managedExtensions?: string[];
  runtimePolicy?: RuntimePolicy | null;
  mcp?: boolean;
  codeMode?: boolean;
  sandbox?: boolean;
  remoteProfile?: string | null;
  tools?: string[] | null;
  instructions?: string | null;
  projectInstructions?: string | null;
  workspaceGuidance?: string | null;
  inspectionGuidance?: string | null;
  automaticCompaction?: boolean;
  keepRecentTokens?: number;
  maxTurns?: number | null;
  tokenBudget?: number | null;
  worktree?: string | null;
  planMode?: boolean;
  postRunCommand?: string | null;
  postRunRepairLimit?: number;
};
type Configuration = {
  managedExtensions?: {
    installed?: { name: string }[];
    selected: string[];
    suspended: boolean;
    problem?: string;
  };
  runtimePolicy?: RuntimePolicy;
  mcpEnabled?: boolean;
  mcpSuspended?: boolean;
  mcp?: {
    invalid: boolean;
    servers: { name: string; connected: boolean; tools: number }[];
  };
  codeMode?: boolean;
  sandbox?: boolean;
  remote?: RemoteWorkspace;
  revision: string;
  tools: InspectorTool[];
  guidance?: Guidance;
  project?: { instructions: string };
  context?: ContextSettings;
  plan?: { active: boolean; markdown?: string };
  postRunCommand?: string | null;
  postRunRepairLimit?: number;
  worktree?: string | null;
  toolSource: "default" | "conversation";
  instructions: string;
  sections: { key: string; text: string }[];
};
export function ConversationInspectorLoading() {
  return (
    <div role="status" aria-busy="true" className="h-full">
      <span className="sr-only">Loading conversation details…</span>
    </div>
  );
}

export function ConversationInspector({
  path,
  request,
  working,
  execution,
  selectedModel,
  savedModel,
  projectId: owningProjectId,
  section,
  sectionRequest,
  onSectionChange,
  onScopeChange,
  embedded = false,
  active = true,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  working: boolean;
  execution?: Execution;
  selectedModel?: ChatModel;
  savedModel?: ModelRef;
  projectId?: string;
  section?: InspectorSectionId;
  sectionRequest?: object;
  onSectionChange?: (section: InspectorSectionId) => void;
  onScopeChange?: (scope: InspectorScope) => void;
  embedded?: boolean;
  active?: boolean;
}) {
  const commands = useCommands();
  const discovery = useBackendCommands();
  const { deviceId, projectId, sessionId } = useParams<{
    deviceId: string;
    projectId?: string;
    sessionId: string;
  }>();
  const machineHref = `/devices/${encodeURIComponent(deviceId)}/settings/guidance`;
  const projectHref = `/devices/${encodeURIComponent(deviceId)}/projects/${encodeURIComponent(owningProjectId ?? projectId ?? "")}/settings`;
  const sessionHref = `/devices/${encodeURIComponent(deviceId)}/sessions/${encodeURIComponent(sessionId)}/settings`;
  const scoped = discovery.supports("session.runtime-settings.update");
  const [data, setData] = useState<Configuration>();
  const [saving, setSaving] = useState(false);
  const [localSelection, setLocalSelection] = useState<{
    section: InspectorSectionId;
  }>({ section: "overview" });
  const requestedSection = section ?? localSelection.section;
  const availableSection = (value: InspectorSectionId) =>
    inspectorSectionAvailable(value, data);
  const activeSection = availableSection(requestedSection)
    ? requestedSection
    : "overview";
  function selectSection(value: InspectorSectionId) {
    setLocalSelection({ section: value });
    onSectionChange?.(value);
  }
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [reloadNotice, setReloadNotice] = useState<string>();
  const generation = useRef(0);
  const loaded = useRef(false);
  const savingRef = useRef(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const version = generation.current;
      try {
        const next = await request<Configuration>(`${path}/configuration`, {
          signal,
        });
        if (
          signal?.aborted ||
          savingRef.current ||
          version !== generation.current
        )
          return;
        const reveal = () => {
          setLoadError(undefined);
          setData(next);
        };
        if (loaded.current) reveal();
        else startTransition(reveal);
        loaded.current = true;
      } catch (cause) {
        if (!signal?.aborted)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Could not load configuration.",
          );
      }
    },
    [path, request],
  );
  const savedProvider = savedModel?.provider;
  const savedModelId = savedModel?.modelId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh as soon as the stream reports a saved model change.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh, savedProvider, savedModelId]);
  async function mutate(action: () => Promise<void>) {
    if (savingRef.current) return false;
    generation.current += 1;
    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save changes.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function update(change: Change) {
    if (!data) return false;
    return mutate(async () => {
      const next = (await commands.invoke("conversation.configure", {
        revision: data.revision,
        ...change,
      })) as Configuration;
      setData(next);
    });
  }
  const compacting = !!execution?.compactions.length;
  const busy = working || compacting;
  const disabled = busy || saving;
  const remote = data?.remote;
  const showRemote = !!remote;
  async function reloadConnections(target: "mcp" | "remote") {
    setReloadNotice(undefined);
    await mutate(async () => {
      const status = await request<{ invalid: boolean }>(
        `${path}/${target}/reload`,
        { method: "POST", body: "{}" },
      );
      setData(await request<Configuration>(`${path}/configuration`));
      setReloadNotice(
        status.invalid
          ? "Configuration could not be loaded. Previous connections were removed."
          : `${target === "mcp" ? "MCP servers" : "SSH profiles"} reloaded for this backend.`,
      );
    });
  }
  return (
    <div className={cn("flex h-full min-h-0 flex-col", !embedded && "p-4")}>
      {(error || loadError) && (
        <p role="alert" className="pb-2 text-xs text-destructive">
          {error || loadError}
        </p>
      )}
      {reloadNotice && (
        <p role="status" className="pb-2 text-xs">
          {reloadNotice}
        </p>
      )}
      {!data && !loadError && <ConversationInspectorLoading />}
      {data && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {requestedSection !== activeSection && (
            <p role="status" className="px-1 text-xs text-foreground/65">
              {inspectorSectionInfo[requestedSection].label} is unavailable on
              this backend. Available controls are listed below.
            </p>
          )}
          {busy && (
            <p role="status" className="px-1 text-xs text-foreground/65">
              Conversation settings can change when this conversation is idle.
            </p>
          )}
          {saving && (
            <p role="status" className="px-1 text-xs text-foreground/65">
              Saving changes… Displayed configuration remains confirmed until
              the backend responds.
            </p>
          )}
          {executionNeedsAttention(execution) && (
            <InspectorSection className="shrink-0">
              <InspectorSectionHeader>
                <InspectorSectionTitle>Execution</InspectorSectionTitle>
              </InspectorSectionHeader>
              <InspectorSectionContent>
                <ExecutionStatus execution={execution} details />
              </InspectorSectionContent>
            </InspectorSection>
          )}
          <InspectorNavigation
            section={activeSection}
            request={sectionRequest ?? localSelection}
            select={selectSection}
            available={availableSection}
            focused={active}
            help={() => commands.invoke("help.capabilities")}
          >
            <InspectorPanel value="overview" active={activeSection}>
              <div className="flex min-w-0 flex-col gap-5">
                <section>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                    Changes here affect this agent. Project guidance and session
                    policies have their own scope tabs.
                  </p>
                  <p className="mt-3 text-xs text-foreground/80">
                    {data.plan?.active ? "Plan mode" : "Execution mode"} ·{" "}
                    {data.tools.filter((tool) => tool.enabled).length} tools
                    enabled
                  </p>
                  <p className="mt-1 wrap-anywhere text-xs text-foreground/65">
                    Workspace:{" "}
                    {data.remote?.profile
                      ? `SSH ${data.remote.profile}`
                      : (data.worktree ??
                        data.guidance?.directory ??
                        "Backend workspace")}
                    {data.sandbox ? " · sandbox enabled" : ""}
                  </p>
                </section>
              </div>
            </InspectorPanel>
            <InspectorPanel value="tools" active={activeSection}>
              <div className="flex min-w-0 flex-col gap-4">
                {data.plan && (
                  <section
                    className="flex flex-col gap-3"
                    aria-label="Plan mode"
                  >
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor="conversation-plan">
                          Plan mode
                        </FieldLabel>
                        <FieldDescription>
                          Review files and propose steps without editing
                          workspace files. Turn off to implement.
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="conversation-plan"
                        checked={data.plan.active}
                        disabled={
                          disabled ||
                          !!commands.get("conversation.plan")?.disabled
                        }
                        onCheckedChange={() =>
                          void mutate(async () => {
                            setData(
                              (await commands.invoke(
                                "conversation.plan",
                              )) as Configuration,
                            );
                          })
                        }
                      />
                    </Field>
                    {data.plan.markdown && (
                      <SettingsDisclosure title="Saved plan">
                        <MessageMarkdown compact text={data.plan.markdown} />
                      </SettingsDisclosure>
                    )}
                  </section>
                )}
                <InspectorTools
                  tools={data.tools}
                  custom={data.toolSource === "conversation"}
                  working={busy}
                  saving={saving}
                  planMode={data.plan?.active}
                  update={(tools) => void update({ tools })}
                />
              </div>
            </InspectorPanel>
            <InspectorPanel value="workspace" active={activeSection}>
              <div className="flex min-w-0 flex-col gap-7">
                {(showRemote ||
                  data.worktree !== undefined ||
                  data.sandbox !== undefined) && (
                  <InspectorWorkspace
                    path={path}
                    request={request}
                    assigned={data.worktree}
                    disabled={disabled}
                    save={(worktree) => update({ worktree })}
                    sandbox={data.sandbox}
                    saveSandbox={(sandbox) => update({ sandbox })}
                    remote={showRemote ? remote : undefined}
                    saveRemote={(remoteProfile) => update({ remoteProfile })}
                    reloadRemote={() => reloadConnections("remote")}
                    hostMcp={data.mcpEnabled || data.mcpSuspended}
                  />
                )}
              </div>
            </InspectorPanel>
            <InspectorPanel value="integrations" active={activeSection}>
              <div className="flex min-w-0 flex-col gap-7">
                {data.plan?.active && (
                  <p className="text-xs text-foreground/65">
                    Plan mode suspends integration tools. Turn it off in
                    Behavior &amp; tool access to change these selections.
                  </p>
                )}
                {(data.sandbox || data.remote?.profile) && (
                  <p className="text-xs text-foreground/65">
                    Host MCP and managed extensions cannot be enabled with
                    sandbox or SSH execution. Use Workspace &amp; isolation to
                    change the execution environment.
                  </p>
                )}
                {data.codeMode !== undefined && (
                  <InspectorSection>
                    <InspectorSectionHeader>
                      <InspectorSectionTitle>
                        Tool scripting (Code Mode)
                      </InspectorSectionTitle>
                      <InspectorSectionDescription>
                        Let the assistant combine tool calls in JavaScript.
                        Leave off for ordinary tool use.
                      </InspectorSectionDescription>
                    </InspectorSectionHeader>
                    <InspectorSectionActions>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={disabled || !!data.plan?.active}
                        onClick={() =>
                          void update({ codeMode: !data.codeMode })
                        }
                      >
                        {data.codeMode
                          ? "Disable Code Mode"
                          : "Enable Code Mode"}
                      </Button>
                    </InspectorSectionActions>
                  </InspectorSection>
                )}
                {data.mcp && (
                  <InspectorSection>
                    <InspectorSectionHeader>
                      <InspectorSectionTitle>MCP tools</InspectorSectionTitle>
                      <InspectorSectionDescription>
                        Tools from servers configured on this backend. Calls run
                        with each server’s own permissions.
                      </InspectorSectionDescription>
                    </InspectorSectionHeader>
                    <InspectorSectionContent>
                      {data.mcp.invalid && (
                        <p role="alert">
                          The backend MCP configuration is invalid or has unsafe
                          file permissions.
                        </p>
                      )}
                      {data.mcp.servers.length === 0 && !data.mcp.invalid && (
                        <p>
                          <Link
                            className="underline underline-offset-4"
                            href={`/devices/${encodeURIComponent(deviceId)}/settings/mcp`}
                          >
                            Add MCP servers
                          </Link>{" "}
                          in machine settings.
                        </p>
                      )}
                      <p>
                        Reload reads the backend configuration file and closes
                        shared connections. Active calls in any chat may be
                        interrupted.
                      </p>
                      <ul className="flex flex-col gap-1">
                        {data.mcp.servers.map((server) => (
                          <li key={server.name}>
                            {server.name} ·{" "}
                            {server.connected
                              ? `${server.tools} tools`
                              : "Disconnected"}
                          </li>
                        ))}
                      </ul>
                    </InspectorSectionContent>
                    <InspectorSectionActions className="flex-wrap gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => void reloadConnections("mcp")}
                      >
                        Reload MCP configuration
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={
                          disabled ||
                          !!data.plan?.active ||
                          (!data.mcpEnabled &&
                            (!!data.sandbox ||
                              !!data.remote?.profile ||
                              !data.mcp.servers.some(
                                (server) =>
                                  server.connected && server.tools > 0,
                              )))
                        }
                        onClick={() => void update({ mcp: !data.mcpEnabled })}
                      >
                        {data.mcpEnabled ? "Disable MCP" : "Enable MCP"}
                      </Button>
                      {data.mcp.servers.some((server) => !server.connected) && (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            void mutate(async () => {
                              await request(`${path}/mcp/reconnect`, {
                                method: "POST",
                                body: "{}",
                              });
                              setData(
                                await request<Configuration>(
                                  `${path}/configuration`,
                                ),
                              );
                            })
                          }
                        >
                          Reconnect servers
                        </Button>
                      )}
                    </InspectorSectionActions>
                  </InspectorSection>
                )}
                {data.managedExtensions && (
                  <InspectorSection>
                    <InspectorSectionHeader>
                      <InspectorSectionTitle>
                        Managed extensions
                      </InspectorSectionTitle>
                      <InspectorSectionDescription>
                        Trusted backend code, installed in machine settings.
                        Selection enables hooks and makes tools available;
                        existing tool restrictions still apply. Plan mode
                        suspends these extensions.
                      </InspectorSectionDescription>
                    </InspectorSectionHeader>
                    <InspectorSectionContent className="flex flex-col gap-2">
                      {data.managedExtensions.problem && (
                        <p role="alert">{data.managedExtensions.problem}</p>
                      )}
                      {[
                        ...new Set([
                          ...(data.managedExtensions.installed ?? []).map(
                            (item) => item.name,
                          ),
                          ...data.managedExtensions.selected,
                        ]),
                      ].map((name) => {
                        const managedExtensions = data.managedExtensions;
                        if (!managedExtensions) return null;
                        const selected =
                          managedExtensions.selected.includes(name);
                        const installed = managedExtensions.installed?.some(
                          (item) => item.name === name,
                        );
                        return (
                          <div
                            key={name}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span>
                              {name}
                              {!installed && " · unavailable"}
                            </span>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={
                                disabled ||
                                data.plan?.active ||
                                (!selected &&
                                  (!installed ||
                                    data.sandbox ||
                                    !!data.remote?.profile))
                              }
                              onClick={() =>
                                void update({
                                  managedExtensions: selected
                                    ? managedExtensions.selected.filter(
                                        (item) => item !== name,
                                      )
                                    : [...managedExtensions.selected, name],
                                })
                              }
                            >
                              {selected ? `Deselect ${name}` : `Select ${name}`}
                            </Button>
                          </div>
                        );
                      })}
                      {!data.managedExtensions.installed?.length &&
                        !data.managedExtensions.selected.length && (
                          <p>
                            <Link
                              className="underline underline-offset-4"
                              href={`/devices/${encodeURIComponent(deviceId)}/settings/extensions`}
                            >
                              Manage extensions
                            </Link>{" "}
                            in machine settings.
                          </p>
                        )}
                    </InspectorSectionContent>
                  </InspectorSection>
                )}
              </div>
            </InspectorPanel>
            <InspectorPanel value="instructions" active={activeSection}>
              <div className="flex min-w-0 flex-col gap-4">
                <InstructionEditor
                  label="Conversation instructions"
                  scope="Applies to each reply in this conversation, starting with the next model request after you save."
                  placeholder="Add guidance for this conversation…"
                  value={data.instructions}
                  disabled={disabled}
                  save={(instructions) => update({ instructions })}
                />
                {data.project &&
                  (discovery.supports("project.agent-settings.update") ? (
                    <div className="text-sm">
                      <p>
                        Shared project instructions and evidence rules apply
                        across this project.
                      </p>
                      {onScopeChange ? (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => onScopeChange("project")}
                        >
                          Edit project agent settings
                        </Button>
                      ) : (
                        <Link href={projectHref}>
                          Edit project agent settings
                        </Link>
                      )}
                    </div>
                  ) : (
                    <InstructionEditor
                      label="Shared project instructions"
                      scope="Saved in Console and applied to model requests across this project. Separate from AGENTS.md, which the agent can read with file tools."
                      placeholder="Add shared conventions or project goals…"
                      value={data.project.instructions}
                      disabled={saving}
                      save={(projectInstructions) =>
                        update({ projectInstructions })
                      }
                    />
                  ))}
                {(data.guidance || data.sections.length > 0) && (
                  <Collapsible className="group/guidance">
                    <CollapsibleTrigger
                      render={<Button variant="ghost" size="sm" />}
                      className="h-auto min-h-7 w-full justify-start whitespace-normal"
                    >
                      <ChevronRight
                        aria-hidden
                        data-icon="inline-start"
                        className="group-data-panel-open/guidance:rotate-90"
                      />
                      Built-in guidance and environment
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="flex min-w-0 flex-col gap-4">
                        {data.guidance?.inspection &&
                          !discovery.supports(
                            "project.agent-settings.update",
                          ) && (
                            <InstructionEditor
                              label="Project evidence rules"
                              scope="Tell the agent what to inspect and how to cite evidence in this project."
                              value={data.guidance.inspection.text}
                              customized={data.guidance.inspection.customized}
                              disabled={saving}
                              save={(inspectionGuidance) =>
                                update({ inspectionGuidance })
                              }
                            />
                          )}
                        {data.guidance &&
                          (discovery.supports(
                            "machine.workspace-guidance.update",
                          ) ? (
                            <div className="text-sm">
                              <p>
                                Workspace guidance is shared across this
                                machine.
                              </p>
                              <Link href={machineHref}>
                                Edit machine workspace guidance
                              </Link>
                            </div>
                          ) : (
                            <InstructionEditor
                              label="Machine-wide evidence rules"
                              scope="Set how the agent verifies claims across all conversations on this machine."
                              value={data.guidance.workspace.text}
                              customized={data.guidance.workspace.customized}
                              disabled={saving}
                              save={(workspaceGuidance) =>
                                update({ workspaceGuidance })
                              }
                            />
                          ))}
                        <RuntimeGuidance
                          guidance={data.guidance}
                          sections={data.sections}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </InspectorPanel>
            <InspectorPanel value="context" active={activeSection}>
              {data.context && (
                <div className="flex min-w-0 flex-col gap-4">
                  <InspectorContext
                    settings={data.context}
                    sessionSettingsHref={scoped ? sessionHref : undefined}
                    openSessionSettings={
                      onScopeChange ? () => onScopeChange("session") : undefined
                    }
                    selectedModel={selectedModel}
                    compacting={compacting}
                    disabled={disabled}
                    save={(keepRecentTokens) => update({ keepRecentTokens })}
                    saveTurnLimit={(maxTurns) => update({ maxTurns })}
                    budgetSaving={saving}
                    saveBudget={(tokenBudget) => update({ tokenBudget })}
                    setAutomatic={(automaticCompaction) =>
                      void update({ automaticCompaction })
                    }
                    compact={(focus) =>
                      mutate(async () => {
                        await commands.invoke("conversation.compact", {
                          focus,
                        });
                      })
                    }
                  />
                  {data.runtimePolicy && !scoped && (
                    <InspectorRuntimePolicy
                      value={data.runtimePolicy}
                      disabled={disabled}
                      model={
                        data.context.model
                          ? `${data.context.model.provider}/${data.context.model.id}`
                          : undefined
                      }
                      save={(runtimePolicy) => update({ runtimePolicy })}
                    />
                  )}
                </div>
              )}
            </InspectorPanel>
            <InspectorPanel value="checks" active={activeSection}>
              {data.postRunCommand !== undefined && (
                <div>
                  <PostRunSettings
                    value={data.postRunCommand}
                    repairLimit={data.postRunRepairLimit ?? 0}
                    disabled={disabled}
                    save={(postRunCommand, postRunRepairLimit) =>
                      update({ postRunCommand, postRunRepairLimit })
                    }
                  />
                </div>
              )}
            </InspectorPanel>
            <InspectorPanel value="tasks" active={activeSection}>
              {(expanded) =>
                data.postRunCommand !== undefined && (
                  <div className="flex flex-col gap-6">
                    <InspectorTasks
                      path={path}
                      request={request}
                      active={active && expanded}
                    />
                  </div>
                )
              }
            </InspectorPanel>
            <InspectorPanel value="agents" active={activeSection}>
              {(expanded) =>
                data.postRunCommand !== undefined && (
                  <div>
                    <InspectorAgents
                      path={path}
                      request={request}
                      active={active && expanded}
                    />
                  </div>
                )
              }
            </InspectorPanel>
            <InspectorPanel value="review" active={activeSection}>
              {data.postRunCommand !== undefined && (
                <div>
                  <ScheduleReview
                    canChooseWorktree={
                      data.worktree !== undefined && !data.remote?.profile
                    }
                    path={path}
                    request={request}
                    savedModel={savedModel}
                  />
                </div>
              )}
            </InspectorPanel>
            <InspectorPanel value="job" active={activeSection}>
              {data.postRunCommand !== undefined && (
                <div>
                  <ScheduleJob path={path} request={request} />
                </div>
              )}
            </InspectorPanel>
            <InspectorPanel value="history" active={activeSection}>
              {(expanded) =>
                data.postRunCommand !== undefined && (
                  <div>
                    <InspectorTaskHistory
                      path={path}
                      request={request}
                      active={active && expanded}
                    />
                  </div>
                )
              }
            </InspectorPanel>
            <InspectorPanel value="status" active={activeSection}>
              <div className="flex min-w-0 flex-col gap-6">
                <section>
                  <h2 className="text-base font-semibold">Effective status</h2>
                  <p className="mt-1 text-xs text-foreground/65">
                    Backend-confirmed configuration; the next-send selection is
                    shown separately.
                  </p>
                  <dl className="mt-4 flex flex-col gap-3">
                    {[
                      [
                        "Saved model",
                        data.context?.model
                          ? `${data.context.model.name} (${data.context.model.provider})`
                          : "None",
                      ],
                      ["Next-send model", selectedModel?.name ?? "Unchanged"],
                      [
                        "Mode",
                        data.plan?.active
                          ? "Plan — workspace read-only tools"
                          : "Execution",
                      ],
                      [
                        "Workspace",
                        data.remote?.profile
                          ? `SSH: ${data.remote.profile}`
                          : (data.worktree ??
                            data.guidance?.directory ??
                            "Backend workspace"),
                      ],
                      [
                        "Sandbox",
                        data.sandbox === undefined
                          ? "Unsupported"
                          : data.sandbox
                            ? "Enabled"
                            : "Disabled",
                      ],
                      [
                        "Tool scripting",
                        data.codeMode ? "Enabled" : "Disabled",
                      ],
                      [
                        "MCP",
                        data.mcpSuspended
                          ? "Suspended"
                          : data.mcpEnabled
                            ? "Enabled"
                            : "Disabled",
                      ],
                      [
                        "Extensions",
                        data.managedExtensions?.suspended
                          ? "Suspended"
                          : data.managedExtensions?.selected.join(", ") ||
                            "None",
                      ],
                      [
                        "Session budget",
                        data.context?.tokenBudget ?? "Unlimited",
                      ],
                      ["Check command", data.postRunCommand ?? "None"],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-xs text-foreground/60">{label}</dt>
                        <dd className="mt-1 wrap-anywhere text-sm">
                          {String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
                {execution && <ExecutionStatus execution={execution} details />}
                <SettingsDisclosure title="Diagnostic identities">
                  <dl className="flex flex-col gap-2 font-mono text-xs text-foreground/65">
                    <dt>Conversation endpoint</dt>
                    <dd className="wrap-anywhere">{path}</dd>
                    <dt>Configuration revision</dt>
                    <dd className="wrap-anywhere">{data.revision}</dd>
                  </dl>
                </SettingsDisclosure>
              </div>
            </InspectorPanel>
          </InspectorNavigation>
        </div>
      )}
    </div>
  );
}

export type ConversationInspectorProps = ComponentProps<
  typeof ConversationInspector
>;

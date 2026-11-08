"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBackendCommands } from "@/components/commands/backend-commands";
import { useCommands } from "@/components/commands/command-registry";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { useBackendRequest } from "@/hooks/use-backend-request";
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
import { InspectorRuntimePolicy } from "./inspector-runtime-policy";
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
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  working: boolean;
  execution?: Execution;
  selectedModel?: ChatModel;
  savedModel?: ModelRef;
  projectId?: string;
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
  const [tasksOpen, setTasksOpen] = useState(false);
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
    <div className="flex h-full min-h-0 flex-col p-4">
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
        <Tabs
          defaultValue="tools"
          onValueChange={(value) => setTasksOpen(value === "tasks")}
          className="min-h-0 flex-1 gap-3"
        >
          <TabsList
            aria-label="Conversation settings"
            className="w-full shrink-0"
          >
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            {data.context && <TabsTrigger value="context">Context</TabsTrigger>}
            {data.postRunCommand !== undefined && (
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            )}
          </TabsList>
          {executionNeedsAttention(execution) && (
            <Card size="sm" className="shrink-0">
              <CardHeader>
                <CardTitle>Execution</CardTitle>
              </CardHeader>
              <CardContent>
                <ExecutionStatus execution={execution} details />
              </CardContent>
            </Card>
          )}
          <TabsContent value="tools" keepMounted className="min-h-0">
            <ScrollArea className="h-full">
              <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
                {data.plan && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>
                        {data.plan.active ? "Plan mode active" : "Plan mode"}
                      </CardTitle>
                      <CardDescription>
                        The assistant can read workspace files and save a plan.
                        Exit to restore the previous tools.
                      </CardDescription>
                    </CardHeader>
                    {data.plan.markdown && (
                      <CardContent>
                        <MessageMarkdown compact text={data.plan.markdown} />
                      </CardContent>
                    )}
                    <CardFooter>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          void update({ planMode: !data.plan?.active })
                        }
                      >
                        {data.plan.active
                          ? "Exit Plan mode"
                          : "Enter Plan mode"}
                      </Button>
                    </CardFooter>
                  </Card>
                )}
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
                {data.codeMode !== undefined && !data.plan?.active && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Code Mode</CardTitle>
                      <CardDescription>
                        Let the assistant compose enabled tools in sandboxed
                        JavaScript and discover deferred tools.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={disabled}
                        onClick={() =>
                          void update({ codeMode: !data.codeMode })
                        }
                      >
                        {data.codeMode
                          ? "Disable Code Mode"
                          : "Enable Code Mode"}
                      </Button>
                    </CardFooter>
                  </Card>
                )}
                {data.mcp && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>MCP tools</CardTitle>
                      <CardDescription>
                        Tools from servers configured on this backend. Calls run
                        with each server’s own permissions.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {data.mcp.invalid && (
                        <p role="alert">
                          The backend MCP configuration is invalid or has unsafe
                          file permissions.
                        </p>
                      )}
                      {data.mcp.servers.length === 0 && !data.mcp.invalid && (
                        <p>No MCP servers are configured.</p>
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
                    </CardContent>
                    <CardFooter className="flex-wrap gap-2">
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
                    </CardFooter>
                  </Card>
                )}
                {data.managedExtensions && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Managed extensions</CardTitle>
                      <CardDescription>
                        Trusted backend code, installed in machine settings.
                        Selection enables hooks and makes tools available;
                        existing tool restrictions still apply. Plan mode
                        suspends these extensions.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
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
                          <p>No managed extensions installed.</p>
                        )}
                    </CardContent>
                  </Card>
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
            </ScrollArea>
          </TabsContent>
          <TabsContent value="instructions" keepMounted className="min-h-0">
            <ScrollArea className="h-full">
              <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
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
                      <Link href={projectHref}>
                        Edit project agent settings
                      </Link>
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
            </ScrollArea>
          </TabsContent>
          {data.postRunCommand !== undefined && (
            <TabsContent value="tasks" keepMounted className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
                  <InspectorTasks
                    path={path}
                    request={request}
                    active={tasksOpen}
                  />
                  <InspectorAgents
                    key={`agents:${path}`}
                    path={path}
                    request={request}
                    active={tasksOpen}
                  />
                  <InspectorTaskHistory
                    key={`task-history:${path}`}
                    path={path}
                    request={request}
                    active={tasksOpen}
                  />
                  <ScheduleJob
                    key={`job:${path}`}
                    path={path}
                    request={request}
                  />
                  <ScheduleReview
                    key={`review:${path}`}
                    canChooseWorktree={
                      data.worktree !== undefined && !data.remote?.profile
                    }
                    path={path}
                    request={request}
                    savedModel={savedModel}
                  />
                  <PostRunSettings
                    value={data.postRunCommand}
                    repairLimit={data.postRunRepairLimit ?? 0}
                    disabled={disabled}
                    save={(postRunCommand, postRunRepairLimit) =>
                      update({ postRunCommand, postRunRepairLimit })
                    }
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}
          {data.context && (
            <TabsContent value="context" keepMounted className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
                  <InspectorContext
                    settings={data.context}
                    sessionSettingsHref={scoped ? sessionHref : undefined}
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
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

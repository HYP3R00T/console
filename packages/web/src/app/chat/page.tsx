"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PlusIcon,
  TerminalSquareIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import { AgentPanels, type InspectorPanel } from "@/components/agent-panels";
import { ComposerModelPicker } from "@/components/composer-model-picker";
import { MachineSettings } from "@/components/machine-settings";
import { NetworkSidebar } from "@/components/network-sidebar";
import { NewSessionDialog } from "@/components/new-session-dialog";
import { ProjectInspector } from "@/components/project-inspector";
import { SessionChat } from "@/components/session-chat";
import { SessionInspector } from "@/components/session-inspector";
import { Trash } from "@/components/trash";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ApiError,
  api,
  type Conversation,
  type ConversationSummary,
  type Machine,
  type Provider,
  type SessionSummary,
  type Workspace,
} from "@/lib/console-api";

type Submission = { text: string; requestId: string };

export default function Home() {
  const [contextPanel, setContextPanel] = useState(() =>
    typeof window !== "undefined"
      ? (new URL(window.location.href).searchParams.get("inspect") ?? "")
      : "",
  );
  const [inspectedProject, setInspectedProject] = useState(() =>
    typeof window !== "undefined"
      ? (new URL(window.location.href).searchParams.get("workspace") ?? "")
      : "",
  );
  useEffect(() => {
    const machine = () => {
      setContextPanel("machine");
      setInspectorOpen(true);
    };
    const project = (event: Event) => {
      setInspectedProject((event as CustomEvent<string>).detail);
      setContextPanel("project");
      setInspectorOpen(true);
    };
    window.addEventListener("console:inspect-machine", machine);
    window.addEventListener("console:inspect-project", project);
    return () => {
      window.removeEventListener("console:inspect-machine", machine);
      window.removeEventListener("console:inspect-project", project);
    };
  }, []);
  const [trashRevision, setTrashRevision] = useState(0);
  useEffect(() => {
    const changed = () => setTrashRevision((n) => n + 1);
    window.addEventListener("console:tree-changed", changed);
    return () => window.removeEventListener("console:tree-changed", changed);
  }, []);
  const [compact, setCompact] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [panel, setPanel] = useState<InspectorPanel>("session");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const navigationRef = usePanelRef();
  const inspectorRef = usePanelRef();
  useEffect(() => {
    if (navigationOpen) navigationRef.current?.expand();
    else navigationRef.current?.collapse();
  }, [navigationOpen, navigationRef]);
  useEffect(() => {
    if (inspectorOpen) inspectorRef.current?.expand();
    else inspectorRef.current?.collapse();
  }, [inspectorOpen, inspectorRef]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState("");
  const conversationRef = useRef("");
  const conversationAttempt = useRef<
    { name?: string; requestId: string } | undefined
  >(undefined);
  const [creating, setCreating] = useState(false);
  const [machine, setMachine] = useState<Machine>();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState("");
  const selectedRef = useRef("");
  const epoch = useRef(0);
  const [snapshot, setSnapshot] = useState<Conversation>();
  const [online, setOnline] = useState(false);
  const [detailOnline, setDetailOnline] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sandboxDirty, setSandboxDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<
    Record<string, Submission | undefined>
  >({});
  const session =
    snapshot?.id === selected &&
    (!conversationId || snapshot.conversationId === conversationId)
      ? snapshot
      : undefined;
  const draftKey = session ? `${session.id}:${session.conversationId}` : "";
  const conversationPath = useCallback(
    (id: string, cid = conversationRef.current) =>
      `/sessions/${id}${cid ? `/conversations/${cid}` : ""}`,
    [],
  );
  const chooseConversation = useCallback((cid: string) => {
    conversationRef.current = cid;
    setConversationId(cid);
    setDirty(false);
    setSandboxDirty(false);
    setDetailOnline(false);
    setDetailError("");
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", cid);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const select = useCallback((id: string) => {
    conversationAttempt.current = undefined;
    conversationRef.current = "";
    setConversationId("");
    setConversations([]);
    selectedRef.current = id;
    setSelected(id);
    setDirty(false);
    setSandboxDirty(false);
    setError("");
    setDetailOnline(false);
    setDetailError("");
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    for (const key of ["conversation", "workspace", "new"])
      url.searchParams.delete(key);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  useEffect(() => {
    const deleted = (event: Event) => {
      const { path, machineId } = (
        event as CustomEvent<{ path: string; machineId: string }>
      ).detail;
      if (
        machineId === (sessionStorage.getItem("console.backend") || "local") &&
        path ===
          `/sessions/${selectedRef.current}/conversations/${conversationRef.current}`
      )
        chooseConversation("");
    };
    window.addEventListener("console:tree-deleted", deleted);
    return () => window.removeEventListener("console:tree-deleted", deleted);
  }, [chooseConversation]);
  useEffect(() => {
    const open = () => setCreating(true);
    setWorkspaceId(
      new URLSearchParams(window.location.search).get("workspace") ?? "",
    );
    window.addEventListener("console:new-session", open);
    if (new URLSearchParams(window.location.search).has("new"))
      setCreating(true);
    return () => window.removeEventListener("console:new-session", open);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setCompact(media.matches);
      if (media.matches) {
        setNavigationOpen(false);
        setInspectorOpen(false);
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let initial = true;
    async function poll() {
      try {
        const [projects, machines, items, connected] = await Promise.all([
          api<Workspace[]>("/workspaces", "GET", undefined, controller.signal),
          api<Machine[]>("/machines", "GET", undefined, controller.signal),
          api<SessionSummary[]>(
            "/sessions",
            "GET",
            undefined,
            controller.signal,
          ),
          api<Provider[]>(
            "/providers?connected=true",
            "GET",
            undefined,
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;
        setWorkspaces(projects);
        setMachine(machines[0]);
        setProviders(connected);
        setConnectionError("");
        setOnline(true);
        if (
          selectedRef.current &&
          !items.some((item) => item.id === selectedRef.current)
        )
          select(items[0]?.id ?? "");
        if (initial) {
          initial = false;
          const id =
            new URL(window.location.href).searchParams.get("session") ||
            items[0]?.id;
          if (id && !selectedRef.current) {
            const cid = new URL(window.location.href).searchParams.get(
              "conversation",
            );
            select(id);
            if (cid) chooseConversation(cid);
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setOnline(false);
          setConnectionError((cause as Error).message);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [select, chooseConversation]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const started = epoch.current;
      try {
        const current = await api<Conversation>(
          conversationPath(encodeURIComponent(selected), conversationId),
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted && started === epoch.current) {
          setSnapshot(current);
          setDetailOnline(true);
          setDetailError("");
          const rows = await api<ConversationSummary[]>(
            `/sessions/${selected}/conversations`,
            "GET",
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted && started === epoch.current) {
            setConversations(rows);
            if (
              conversationRef.current &&
              !rows.some((row) => row.id === conversationRef.current)
            )
              chooseConversation(rows[0]?.id ?? "");
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted && started === epoch.current) {
          setDetailOnline(false);
          setDetailError((cause as Error).message);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selected, conversationId, conversationPath, chooseConversation]);

  async function operate(id: string, action: () => Promise<void>) {
    const cid = conversationRef.current;
    ++epoch.current;
    setWorking(true);
    setError("");
    try {
      await action();
      const current = await api<Conversation>(conversationPath(id, cid));
      ++epoch.current;
      if (selectedRef.current === id && conversationRef.current === cid) {
        setSnapshot(current);
        setDetailOnline(true);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      ++epoch.current;
      setWorking(false);
    }
  }
  async function newAgent() {
    if (!session) return;
    const input = conversationAttempt.current ?? {
      requestId: crypto.randomUUID(),
    };
    conversationAttempt.current = input;
    await operate(session.id, async () => {
      const row = await api<ConversationSummary>(
        `/sessions/${session.id}/conversations`,
        "POST",
        input,
      );
      conversationAttempt.current = undefined;
      chooseConversation(row.id);
    });
  }
  const forkAttempt = useRef<
    { entryId: string; requestId: string } | undefined
  >(undefined);
  async function fork(entryId: string) {
    if (!session) return;
    const input =
      forkAttempt.current?.entryId === entryId
        ? forkAttempt.current
        : { entryId, requestId: crypto.randomUUID() };
    forkAttempt.current = input;
    await operate(session.id, async () => {
      const row = await api<ConversationSummary>(
        `${conversationPath(session.id)}/fork`,
        "POST",
        input,
      );
      forkAttempt.current = undefined;
      chooseConversation(row.id);
    });
  }
  async function send() {
    if (!session || working) return;
    const id = session.id;
    const key = `${id}:${session.conversationId}`;
    const input = pending[key] ?? {
      text: drafts[key] ?? "",
      requestId: crypto.randomUUID(),
    };
    setPending((items) => ({ ...items, [key]: input }));
    await operate(id, async () => {
      try {
        await api(
          `${conversationPath(id, session.conversationId)}/messages`,
          "POST",
          input,
        );
      } catch (cause) {
        if (
          cause instanceof ApiError &&
          [400, 403, 404, 409, 413, 415].includes(cause.status)
        )
          setPending((items) => ({ ...items, [key]: undefined }));
        throw cause;
      }
      setPending((items) => ({ ...items, [key]: undefined }));
      setDrafts((items) => ({
        ...items,
        [key]: items[key] === input.text ? "" : (items[key] ?? ""),
      }));
    });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {(error || connectionError || detailError) && (
        <p
          role="alert"
          className="shrink-0 border-b bg-destructive/5 px-5 py-3 text-sm text-destructive"
        >
          {error || connectionError || detailError}
        </p>
      )}
      <main className="relative flex min-h-0 flex-1">
        <ResizablePanelGroup orientation={compact ? "vertical" : "horizontal"}>
          <ResizablePanel
            id="navigation"
            panelRef={navigationRef}
            collapsible
            collapsedSize="36px"
            onResize={(size) => setNavigationOpen(size.inPixels > 40)}
            defaultSize={compact ? "40%" : "22%"}
            minSize={compact ? "25%" : "220px"}
            maxSize={compact ? "65%" : "50%"}
          >
            <aside
              id="workspace-navigation"
              aria-label="Workspace navigation"
              className="flex h-full min-h-0 flex-col bg-sidebar"
            >
              <div className="flex h-10 shrink-0 items-center border-b px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={
                    navigationOpen ? "Collapse network" : "Expand network"
                  }
                  aria-expanded={navigationOpen}
                  onClick={() => setNavigationOpen(!navigationOpen)}
                >
                  {navigationOpen ? (
                    <PanelLeftCloseIcon />
                  ) : (
                    <PanelLeftOpenIcon />
                  )}
                </Button>
                {navigationOpen && (
                  <span className="ml-2 text-xs tracking-widest text-muted-foreground">
                    NETWORK
                  </span>
                )}
                {navigationOpen && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto size-7"
                    aria-label="Add machine"
                    onClick={() => window.location.assign("/machines")}
                  >
                    <PlusIcon />
                  </Button>
                )}
              </div>
              <div
                className={
                  navigationOpen ? "flex h-full min-h-0 flex-col" : "hidden"
                }
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <NetworkSidebar
                    selected={selected}
                    conversationId={session?.conversationId}
                    onSelect={(id, cid) => {
                      setContextPanel("");
                      if (id !== selected) select(id);
                      if (cid) chooseConversation(cid);
                    }}
                    onNew={(id) => {
                      setWorkspaceId(id);
                      setCreating(true);
                    }}
                  />
                </div>
                <Trash
                  key={`sessions-${trashRevision}`}
                  kind="sessions"
                  onRestore={() => {
                    window.dispatchEvent(new Event("console:tree-changed"));
                  }}
                />
                {session && (
                  <Trash
                    key={`${session.id}:${trashRevision}`}
                    kind="conversations"
                    sessionId={session.id}
                    onRestore={() => {
                      void api<ConversationSummary[]>(
                        `/sessions/${session.id}/conversations`,
                      ).then(setConversations);
                    }}
                  />
                )}
              </div>
            </aside>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Resize machine and session navigation"
            disabled={!navigationOpen}
            className={navigationOpen ? undefined : "hidden"}
          />
          <ResizablePanel
            id="inspector"
            panelRef={inspectorRef}
            collapsible
            collapsedSize="36px"
            onResize={(size) => setInspectorOpen(size.inPixels > 40)}
            defaultSize="28%"
            minSize={compact ? "25%" : "260px"}
            maxSize="55%"
          >
            <aside
              aria-label="Agent inspector"
              className="flex h-full min-h-0 flex-col border-r bg-sidebar"
            >
              <div className="flex h-10 shrink-0 items-center border-b px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={
                    inspectorOpen ? "Collapse inspector" : "Expand inspector"
                  }
                  aria-expanded={inspectorOpen}
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                >
                  {inspectorOpen ? (
                    <PanelRightCloseIcon />
                  ) : (
                    <PanelRightOpenIcon />
                  )}
                </Button>
                {inspectorOpen && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {contextPanel
                      ? contextPanel === "machine"
                        ? "Machine settings"
                        : "Project settings"
                      : "Agent controls"}
                  </span>
                )}
              </div>
              <div
                className={
                  inspectorOpen ? "flex h-full min-h-0 flex-col" : "hidden"
                }
              >
                <nav
                  aria-label="Agent panels"
                  className="flex shrink-0 border-b"
                >
                  {(
                    ["session", "state", "tasks", "tools", "extend"] as const
                  ).map((item) => (
                    <button
                      type="button"
                      key={item}
                      aria-current={panel === item ? "page" : undefined}
                      className={`flex-1 border-b-2 px-1 py-4 text-xs capitalize ${panel === item ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
                      onClick={() => {
                        setContextPanel("");
                        setPanel(item);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </nav>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {contextPanel ? (
                    contextPanel === "project" ? (
                      <ProjectInspector
                        key={inspectedProject}
                        id={inspectedProject}
                      />
                    ) : (
                      <div className="p-3">
                        <MachineSettings />
                      </div>
                    )
                  ) : session ? (
                    <>
                      <div hidden={panel !== "session"}>
                        <SessionInspector
                          key={`${session.id}:${session.conversationId}`}
                          session={session}
                          providers={providers}
                          disabled={
                            working ||
                            !online ||
                            !detailOnline ||
                            session.status !== "idle"
                          }
                          onDirtyChange={setDirty}
                          onSandboxDirtyChange={setSandboxDirty}
                          onSandboxSave={(input) =>
                            operate(session.id, async () => {
                              await api(
                                `${conversationPath(session.id)}/sandbox`,
                                "PATCH",
                                input,
                              );
                            })
                          }
                          onSave={(input) =>
                            operate(session.id, async () => {
                              await api(
                                `${conversationPath(session.id)}/config`,
                                "PATCH",
                                input,
                              );
                            })
                          }
                        />
                      </div>
                      {panel !== "session" && (
                        <AgentPanels
                          key={`${session.id}:${session.conversationId}`}
                          path={conversationPath(
                            session.id,
                            session.conversationId,
                          )}
                          panel={panel}
                          idle={
                            session.status === "idle" &&
                            online &&
                            detailOnline &&
                            !working
                          }
                          onConfigure={() => {
                            setPanel("session");
                            setInspectorOpen(true);
                          }}
                          onChanged={() =>
                            void operate(session.id, async () => {})
                          }
                        />
                      )}
                    </>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      Select an agent from the network.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Resize agent inspector"
            disabled={!inspectorOpen}
            className={inspectorOpen ? undefined : "hidden"}
          />
          <ResizablePanel id="conversation" minSize="30%">
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              {session && (
                <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
                  <span>
                    {conversations.find(
                      (item) => item.id === session.conversationId,
                    )?.name ?? "Main"}{" "}
                    · #{session.conversationId}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working || !online}
                    onClick={() => void newAgent()}
                  >
                    New agent
                  </Button>
                </div>
              )}

              {session ? (
                <SessionChat
                  modelPicker={
                    <ComposerModelPicker
                      session={session}
                      providers={providers}
                      disabled={
                        !online ||
                        !detailOnline ||
                        working ||
                        session.status !== "idle"
                      }
                      onConfigure={() => {
                        setPanel("session");
                        setInspectorOpen(true);
                      }}
                      onSave={async (input) => {
                        setWorking(true);
                        try {
                          await api(
                            `${conversationPath(session.id)}/config`,
                            "PATCH",
                            input,
                          );
                          setSnapshot(await api(conversationPath(session.id)));
                        } finally {
                          setWorking(false);
                        }
                      }}
                    />
                  }
                  onFork={(entryId) => void fork(entryId)}
                  onCommand={(command) => {
                    if (command === "new") void newAgent();
                    else if (command === "new-session") setCreating(true);
                    else if (command === "stop" || command === "resume")
                      void operate(session.id, async () => {
                        await api(
                          `${conversationPath(session.id)}/${command === "stop" ? "cancel" : "resume"}`,
                          "POST",
                        );
                      });
                    else {
                      setPanel(
                        command === "config"
                          ? "session"
                          : (command as InspectorPanel),
                      );
                      setInspectorOpen(true);
                    }
                  }}
                  agentName={
                    conversations.find(
                      (item) => item.id === session.conversationId,
                    )?.name
                  }
                  projectName={
                    workspaces.find((item) => item.id === session.workspaceId)
                      ?.name
                  }
                  onConfigure={() => {
                    setPanel("session");
                    setInspectorOpen(true);
                  }}
                  session={session}
                  machineName={machine?.name}
                  online={online && detailOnline}
                  working={working}
                  dirty={dirty || sandboxDirty}
                  configured={Boolean(
                    providers.find(
                      (provider) => provider.id === session.model?.provider,
                    )?.configured,
                  )}
                  text={drafts[draftKey] ?? ""}
                  uncertain={Boolean(pending[draftKey])}
                  onText={(text) =>
                    setDrafts((items) => ({ ...items, [draftKey]: text }))
                  }
                  onSend={() => void send()}
                  onControl={(action) =>
                    void operate(session.id, async () => {
                      await api(
                        `${conversationPath(session.id)}/${action}`,
                        "POST",
                      );
                    })
                  }
                />
              ) : (
                <section className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="rounded-none border bg-muted/30 p-4">
                    <TerminalSquareIcon className="size-7" aria-hidden="true" />
                  </div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Your local agent workspace
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {selected
                      ? "Opening session…"
                      : "A conversation with continuity."}
                  </h2>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    {selected
                      ? "Loading saved history from this machine."
                      : "Create a session, connect a provider, and give your agent something to work on."}
                  </p>
                  {!selected && (
                    <Button
                      variant="outline"
                      disabled={!online || working}
                      onClick={() => setCreating(true)}
                    >
                      <PlusIcon data-icon="inline-start" />
                      New session
                    </Button>
                  )}
                </section>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <NewSessionDialog
        open={creating}
        working={working}
        error={error}
        onClose={() => setCreating(false)}
        workspaces={workspaces}
        defaultWorkspace={workspaceId}
        onCreate={async (name, requestId, workspaceId, access) => {
          setWorking(true);
          setError("");
          try {
            const created = await api<Conversation>("/sessions", "POST", {
              ...(name ? { name } : {}),
              requestId,
              workspaceId,
              access: workspaceId ? access : "none",
            });
            select(created.id);
            setCreating(false);
            setPanel("session");
            setSnapshot(created);
            setDetailOnline(true);
            setDetailError("");
            return true;
          } catch (cause) {
            setError((cause as Error).message);
            return false;
          } finally {
            setWorking(false);
          }
        }}
      />
    </div>
  );
}

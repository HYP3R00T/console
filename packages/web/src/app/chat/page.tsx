"use client";

import {
  FolderIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MonitorIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PlusIcon,
  PuzzleIcon,
  SettingsIcon,
  TerminalSquareIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGroupRef } from "react-resizable-panels";
import { AgentPanels, type InspectorPanel } from "@/components/agent-panels";
import { ComposerModelPicker } from "@/components/composer-model-picker";
import { useBackend } from "@/components/connection-context";
import { NetworkSidebar } from "@/components/network-sidebar";
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
  type MessageMode,
  type Provider,
  type SessionSummary,
  type Workspace,
} from "@/lib/console-api";

const inspectorTabs = [
  { id: "session", label: "Overview", icon: MessageSquareIcon },
  { id: "tasks", label: "Activity", icon: ListTodoIcon },
  { id: "tools", label: "Access", icon: WrenchIcon },
  { id: "extend", label: "Instructions", icon: PuzzleIcon },
] as const;

function usePanelOpen(key: string) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* Storage can be unavailable in private browser configurations. */
    }
    return !window.matchMedia("(max-width: 767px)").matches;
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, String(open));
    } catch {
      /* Keep controls usable without storage. */
    }
  }, [key, open]);
  return [open, setOpen] as const;
}

type Submission = { text: string; requestId: string; whenBusy?: MessageMode };

export default function Home() {
  const { connections, id: machineId, select: selectMachine } = useBackend();
  const [navigationOpen, setNavigationOpen] = usePanelOpen(
    "console.network-open",
  );
  const [inspectorOpen, setInspectorOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      new URL(window.location.href).searchParams.get("inspect") === "project",
  );
  const closeControl = useRef<HTMLButtonElement>(null);
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
    const project = (event: Event) => {
      setInspectedProject((event as CustomEvent<string>).detail);
      setContextPanel("project");
      setInspectorOpen(true);
    };
    window.addEventListener("console:inspect-project", project);
    return () => {
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
  const [panel, setPanel] = useState<InspectorPanel>("session");
  const layoutRef = useGroupRef();
  const expandedInspector = useRef(32);
  const expandedNavigation = useRef(22);
  const compactNavigation = useRef(40);
  useEffect(() => {
    const navigation = navigationOpen
      ? compact
        ? compactNavigation.current
        : expandedNavigation.current
      : 0;
    const details = inspectorOpen && !compact ? expandedInspector.current : 0;
    // Apply after the panels register their changed open/closed constraints.
    const frame = requestAnimationFrame(() => {
      layoutRef.current?.setLayout({
        navigation,
        conversation: 100 - navigation - details,
        details,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationOpen, inspectorOpen, compact, layoutRef]);
  function closeInspector() {
    setInspectorOpen(false);
  }
  function toggleNavigation() {
    setNavigationOpen(!navigationOpen);
  }
  useEffect(() => {
    if (!inspectorOpen) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeControl.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented)
        setInspectorOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [inspectorOpen]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState("");
  const conversationRef = useRef("");
  const conversationAttempt = useRef<
    { name?: string; requestId: string } | undefined
  >(undefined);
  const [creating, setCreating] = useState(false);
  const creationInFlight = useRef(false);
  const focusNewConversation = useRef(false);
  const creationAttempt = useRef<{
    machineId: string;
    workspaceId: string;
    requestId: string;
  }>(undefined);
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
  const [sandboxDirty, setSandboxDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [messageModes, setMessageModes] = useState<Record<string, MessageMode>>(
    {},
  );
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
    if (!creating || !online || creationInFlight.current) return;
    creationInFlight.current = true;
    const previous = creationAttempt.current;
    const input =
      previous?.machineId === machineId && previous.workspaceId === workspaceId
        ? previous
        : { machineId, workspaceId, requestId: crypto.randomUUID() };
    creationAttempt.current = input;
    setWorking(true);
    setError("");
    void (async () => {
      try {
        const created = await api<Conversation>(
          "/sessions",
          "POST",
          {
            requestId: input.requestId,
            workspaceId: input.workspaceId || undefined,
            access: "project",
          },
          undefined,
          input.machineId,
        );
        creationAttempt.current = undefined;
        ++epoch.current;
        focusNewConversation.current = true;
        select(created.id);
        setSnapshot(created);
        setDetailOnline(true);
        setDetailError("");
        window.dispatchEvent(new Event("console:tree-changed"));
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        creationInFlight.current = false;
        setCreating(false);
        setWorking(false);
      }
    })();
  }, [creating, online, machineId, workspaceId, select]);

  useEffect(() => {
    if (focusNewConversation.current && session) {
      document.getElementById("message")?.focus({ preventScroll: true });
      focusNewConversation.current = false;
    }
  }, [session]);

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
  async function send(mode?: MessageMode) {
    if (!session || working) return;
    const id = session.id;
    const key = `${id}:${session.conversationId}`;
    const input = pending[key] ?? {
      text: drafts[key] ?? "",
      requestId: crypto.randomUUID(),
      ...(session.queue === undefined
        ? {}
        : { whenBusy: mode ?? messageModes[key] ?? "steer" }),
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
  const selectedConversation = conversations.find(
    (item) => item.id === session?.conversationId,
  );
  const parentConversation = conversations.find(
    (item) => item.id === selectedConversation?.parentId,
  );
  const parentName =
    parentConversation?.name === "Main"
      ? session?.name
      : parentConversation?.name;
  const relationship =
    selectedConversation?.kind === "fork" ? "Forked from" : "Delegated by";
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
        <ResizablePanelGroup
          groupRef={layoutRef}
          orientation={compact ? "vertical" : "horizontal"}
          onLayoutChanged={(layout, meta) => {
            if (!meta.isUserInteraction) return;
            if (navigationOpen) {
              if (compact) compactNavigation.current = layout.navigation;
              else expandedNavigation.current = layout.navigation;
            }
            if (inspectorOpen && !compact)
              expandedInspector.current = layout.details;
          }}
        >
          <ResizablePanel
            id="navigation"
            collapsible={false}
            defaultSize={compact ? "40%" : "22%"}
            minSize={navigationOpen ? (compact ? "25%" : "260px") : "40px"}
            maxSize={navigationOpen ? (compact ? "65%" : "50%") : "40px"}
          >
            <aside
              id="workspace-navigation"
              aria-label="Workspace navigation"
              className={`flex h-full min-h-0 bg-background ${compact && !navigationOpen ? "flex-row" : "flex-col"}`}
            >
              <div className="flex h-10 shrink-0 items-center border-b px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 aria-expanded:bg-transparent"
                  aria-label={
                    navigationOpen ? "Collapse machines" : "Expand machines"
                  }
                  aria-expanded={navigationOpen}
                  onClick={toggleNavigation}
                >
                  {navigationOpen ? (
                    <PanelLeftCloseIcon />
                  ) : (
                    <PanelLeftOpenIcon />
                  )}
                </Button>
                {navigationOpen && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Machines
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
              {!navigationOpen && (
                <nav
                  aria-label="Collapsed machines"
                  className={`flex gap-1 overflow-auto p-1 ${compact ? "flex-row" : "flex-col"}`}
                >
                  {connections.map((connection) => (
                    <Button
                      key={connection.id}
                      size="icon"
                      variant="ghost"
                      className={`relative size-7 shrink-0 ${machineId === connection.id ? "bg-accent" : ""}`}
                      aria-label={`Open machine ${connection.name}`}
                      title={`${connection.name} · ${connection.status}`}
                      onClick={() => {
                        if (machineId !== connection.id)
                          selectMachine(connection.id);
                        setNavigationOpen(true);
                      }}
                    >
                      <MonitorIcon className="size-4" />
                      <span
                        aria-hidden="true"
                        className={`absolute right-1 bottom-1 size-1.5 rounded-full ${connection.status === "online" ? "bg-green-500" : "bg-muted-foreground"}`}
                      />
                    </Button>
                  ))}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label="Add machine"
                    title="Add machine"
                    onClick={() => window.location.assign("/machines")}
                  >
                    <PlusIcon />
                  </Button>
                </nav>
              )}
              <div
                className={
                  navigationOpen ? "flex h-full min-h-0 flex-col" : "hidden"
                }
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <NetworkSidebar
                    selected={selected}
                    creating={creating || working}
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
            aria-label="Resize machine and session navigation"
            disabled={!navigationOpen}
          />
          <ResizablePanel id="conversation" minSize="30%">
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              {session ? (
                <SessionChat
                  key={`${session.id}:${session.conversationId}`}
                  historyPath={conversationPath(
                    session.id,
                    session.conversationId,
                  )}
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
                    else if (command === "new-session") {
                      setWorkspaceId(session.workspaceId ?? "");
                      setCreating(true);
                    } else if (command === "stop" || command === "resume")
                      void operate(session.id, async () => {
                        await api(
                          `${conversationPath(session.id)}/${command === "stop" ? "cancel" : "resume"}`,
                          "POST",
                        );
                      });
                    else {
                      setContextPanel(command === "state" ? "machine" : "");
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
                    )?.name === "Main"
                      ? session.name
                      : conversations.find(
                          (item) => item.id === session.conversationId,
                        )?.name
                  }
                  projectName={
                    workspaces.find((item) => item.id === session.workspaceId)
                      ?.name
                  }
                  inspectorOpen={inspectorOpen}
                  onConfigure={() => {
                    if (inspectorOpen) closeInspector();
                    else {
                      setContextPanel("");
                      setPanel("session");
                      setInspectorOpen(true);
                    }
                  }}
                  session={session}
                  machineName={machine?.name}
                  online={online && detailOnline}
                  working={working}
                  dirty={sandboxDirty}
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
                  mode={messageModes[draftKey] ?? "steer"}
                  onMode={(mode) =>
                    setMessageModes((items) => ({ ...items, [draftKey]: mode }))
                  }
                  onSend={(mode) => void send(mode)}
                  onWithdraw={(id) =>
                    void operate(session.id, async () => {
                      await api(
                        `${conversationPath(session.id)}/submissions/${id}`,
                        "DELETE",
                      );
                    })
                  }
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
                      : "Create a conversation, connect a provider, and give your agent something to work on."}
                  </p>
                  {!selected && (
                    <Button
                      variant="outline"
                      disabled={!online || working}
                      onClick={() => setCreating(true)}
                    >
                      <PlusIcon data-icon="inline-start" />
                      New conversation
                    </Button>
                  )}
                </section>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle
            disabled={!inspectorOpen || compact}
            className={inspectorOpen && !compact ? "" : "hidden"}
            aria-label="Resize details panel"
          />
          <ResizablePanel
            id="details"
            defaultSize="0px"
            minSize={inspectorOpen && !compact ? "320px" : "0px"}
            maxSize={inspectorOpen && !compact ? "45%" : "0px"}
            className={compact ? "overflow-visible!" : ""}
          >
            <aside
              id="conversation-details"
              aria-label="Details panel"
              className={`${inspectorOpen ? "flex" : "hidden"} h-full min-h-0 flex-col bg-background ${compact ? "absolute inset-y-0 right-0 z-30 w-full max-w-md border-l shadow-lg" : ""}`}
            >
              <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">
                    {contextPanel === "project"
                      ? "Project"
                      : contextPanel === "machine"
                        ? "Machine"
                        : "Conversation"}
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {contextPanel === "machine"
                      ? connections.find((item) => item.id === machineId)?.name
                      : contextPanel === "project"
                        ? workspaces.find(
                            (item) => item.id === inspectedProject,
                          )?.name
                        : conversations.find(
                              (item) => item.id === session?.conversationId,
                            )?.name === "Main"
                          ? session?.name
                          : conversations.find(
                              (item) => item.id === session?.conversationId,
                            )?.name}
                  </p>
                </div>
                <Button
                  ref={closeControl}
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close details panel"
                  title="Close details"
                  onClick={closeInspector}
                >
                  <PanelRightCloseIcon />
                </Button>
              </header>
              {!contextPanel && parentName && (
                <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                  {relationship} {parentName}
                </p>
              )}
              <nav
                aria-label="Details scope"
                className="grid shrink-0 grid-cols-3 gap-1 border-b p-2"
              >
                {(
                  [
                    { id: "", label: "Conversation", icon: MessageSquareIcon },
                    {
                      id: "project",
                      label: "Project",
                      icon: FolderIcon,
                    },
                    { id: "machine", label: "Machine", icon: MonitorIcon },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={contextPanel === id}
                    disabled={
                      id === "project" &&
                      !session?.workspaceId &&
                      !inspectedProject
                    }
                    className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs disabled:opacity-40 ${contextPanel === id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"}`}
                    onClick={() => {
                      setContextPanel(id);
                      if (id === "project" && session?.workspaceId)
                        setInspectedProject(session.workspaceId);
                      if (id === "" && panel === "state") setPanel("session");
                    }}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </nav>
              {!contextPanel && (
                <nav
                  aria-label="Conversation sections"
                  className="grid shrink-0 grid-cols-4 border-b"
                >
                  {inspectorTabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-current={panel === id ? "page" : undefined}
                      className={`flex flex-col items-center gap-1 border-b-2 px-1 py-3 text-[11px] ${panel === id ? "border-foreground" : "border-transparent text-muted-foreground hover:bg-accent/60"}`}
                      onClick={() => setPanel(id)}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </nav>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div hidden={contextPanel !== "project"}>
                  {inspectedProject && (
                    <ProjectInspector
                      key={inspectedProject}
                      id={inspectedProject}
                    />
                  )}
                </div>
                <div hidden={contextPanel === "project"}>
                  <div hidden={contextPanel !== "machine"}>
                    <div className="border-b p-4">
                      <a
                        href="/settings?section=machine"
                        className="flex items-center gap-2 text-xs hover:underline"
                      >
                        <SettingsIcon className="size-3.5" />
                        Machine settings and providers
                      </a>
                    </div>
                    {contextPanel === "machine" && (
                      <AgentPanels
                        path={
                          session
                            ? conversationPath(
                                session.id,
                                session.conversationId,
                              )
                            : ""
                        }
                        panel="state"
                        idle={false}
                        onChanged={() => {}}
                      />
                    )}
                  </div>
                  {session ? (
                    <div hidden={contextPanel === "machine"}>
                      <SessionInspector
                        key={`${session.id}:${session.conversationId}`}
                        session={session}
                        panel={panel}
                        disabled={
                          working ||
                          !online ||
                          !detailOnline ||
                          session.status !== "idle"
                        }
                        onResourcePrompt={(text) => {
                          setDrafts((items) => ({
                            ...items,
                            [draftKey]: text,
                          }));
                          document.getElementById("message")?.focus();
                        }}
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
                      />
                      <div hidden={panel === "session" || panel === "state"}>
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
                          onChanged={() =>
                            void operate(session.id, async () => {})
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="p-4 text-xs text-muted-foreground">
                      Select a conversation.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}

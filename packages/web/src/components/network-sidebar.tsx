"use client";

import {
  ChevronRightIcon,
  FolderIcon,
  MessageSquareIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBackend } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  api,
  type BackendConnection,
  type ConversationSummary,
  type SessionSummary,
  type Workspace,
} from "@/lib/console-api";

function Branch({
  label,
  children,
  actions,
  initial = false,
  onActivate,
  editing,
}: {
  label: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  initial?: boolean;
  onActivate?: () => void;
  editing?: boolean;
}) {
  return (
    <Collapsible defaultOpen={initial} className="min-w-0">
      <div className="group relative flex items-center gap-1 py-1">
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 p-1">
            <ChevronRightIcon
              className="size-3 shrink-0 opacity-0"
              aria-hidden="true"
            />
            {label}
          </div>
        ) : (
          <CollapsibleTrigger
            onClick={onActivate}
            className="group flex min-w-0 flex-1 items-center gap-1.5 p-1 text-left text-xs hover:bg-accent"
          >
            <ChevronRightIcon className="size-3 shrink-0 group-data-[panel-open]:rotate-90" />
            {label}
          </CollapsibleTrigger>
        )}
        {actions}
      </div>
      <CollapsibleContent>
        <div className="ml-3 border-l pl-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
function RowActions({
  name,
  path,
  machineId,
  refresh,
  create,
  onRename,
}: {
  name: string;
  path: string;
  machineId: string;
  refresh: () => void;
  create?: () => void;
  onRename: () => void;
}) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function mutate(method: string, body?: unknown) {
    setWorking(true);
    setError("");
    try {
      await api(path, method, body, undefined, machineId);
      if (method === "DELETE")
        window.dispatchEvent(
          new CustomEvent("console:tree-deleted", {
            detail: { machineId, path },
          }),
        );
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <span className="flex shrink-0 items-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
      {create && (
        <Button
          size="icon"
          className="size-6"
          variant="ghost"
          aria-label={`New conversation in ${name}`}
          onClick={create}
        >
          <PlusIcon className="size-3" />
        </Button>
      )}
      <Button
        size="icon"
        className="size-6"
        variant="ghost"
        aria-label={`Rename ${name}`}
        onClick={onRename}
      >
        <PencilIcon className="size-3" />
      </Button>
      <Button
        size="icon"
        className="size-6"
        variant="ghost"
        disabled={working}
        aria-label={`Move ${name} to Trash`}
        onClick={() => void mutate("DELETE")}
      >
        <TrashIcon className="size-3" />
      </Button>
      {error && (
        <span
          role="alert"
          className="absolute top-full left-0 z-20 border bg-popover p-2 text-xs text-destructive"
        >
          {error}
          <button type="button" onClick={() => setError("")}>
            Dismiss
          </button>
        </span>
      )}
    </span>
  );
}

export function NetworkSidebar({
  selected,
  conversationId,
  onSelect,
  onNew,
  toggle,
}: {
  toggle?: ReactNode;
  selected: string;
  conversationId?: string;
  onSelect: (sessionId: string, conversationId?: string) => void;
  onNew: (projectId: string) => void;
}) {
  const { connections, id } = useBackend();
  return (
    <nav aria-label="Machine network" className="relative p-2">
      <div className="flex items-center justify-between px-1 py-3">
        {toggle}
        <h2 className="flex-1 text-xs font-medium tracking-widest text-muted-foreground">
          NETWORK
        </h2>
        <Link href="/machines" aria-label="Add machine">
          <PlusIcon className="size-4" />
        </Link>
      </div>
      {connections.map((machine) => (
        <MachineBranch
          key={machine.id}
          machine={machine}
          active={machine.id === id}
          selected={selected}
          conversationId={conversationId}
          onSelect={onSelect}
          onNew={onNew}
        />
      ))}
    </nav>
  );
}
function MachineBranch({
  machine,
  active,
  selected,
  conversationId,
  onSelect,
  onNew,
}: {
  machine: BackendConnection;
  active: boolean;
  selected: string;
  conversationId?: string;
  onSelect: (id: string, cid?: string) => void;
  onNew: (id: string) => void;
}) {
  const { select: selectMachine } = useBackend();
  const [data, setData] = useState<{
    projects: Workspace[];
    sessions: SessionSummary[];
    conversations: Record<string, ConversationSummary[]>;
  }>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState("");
  const attempts = useRef<Record<string, string>>({});
  const [edit, setEdit] = useState<{ path: string; value: string }>();
  const editRef = useRef<typeof edit>(undefined);
  const focusName = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);
  function startRename(path: string, value: string) {
    setActionError("");
    editRef.current = { path, value };
    setEdit(editRef.current);
  }
  async function saveRename() {
    const input = editRef.current;
    if (!input) return;
    editRef.current = undefined;
    setEdit(undefined);
    if (!input.value.trim()) {
      setActionError("Names cannot be blank.");
      return;
    }
    try {
      await api(
        input.path,
        "PATCH",
        { name: input.value.trim() },
        undefined,
        machine.id,
      );
      refresh();
    } catch (cause) {
      setActionError((cause as Error).message);
    }
  }
  function nameLabel(name: string, path: string) {
    return edit?.path === path ? (
      <input
        ref={focusName}
        aria-label={`Rename ${name}`}
        className="min-w-0 w-full border bg-background px-1 text-xs"
        maxLength={80}
        value={edit.value}
        onChange={(event) => {
          const value = { path, value: event.target.value };
          editRef.current = value;
          setEdit(value);
        }}
        onBlur={() => void saveRename()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void saveRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            editRef.current = undefined;
            setEdit(undefined);
          }
        }}
      />
    ) : (
      <span className="min-w-0 flex-1 truncate" title={name}>
        {name}
      </span>
    );
  }
  const refresh = () => {
    setRevision((value) => value + 1);
    window.dispatchEvent(new Event("console:tree-changed"));
  };
  useEffect(() => {
    void revision; // Re-fetch immediately after a tree mutation.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [projects, sessions] = await Promise.all([
          api<Workspace[]>(
            "/workspaces",
            "GET",
            undefined,
            controller.signal,
            machine.id,
          ),
          api<SessionSummary[]>(
            "/sessions",
            "GET",
            undefined,
            controller.signal,
            machine.id,
          ),
        ]);
        const entries = await Promise.all(
          sessions
            .filter((session) => session.status !== "unavailable")
            .map(
              async (session) =>
                [
                  session.id,
                  await api<ConversationSummary[]>(
                    `/sessions/${session.id}/conversations`,
                    "GET",
                    undefined,
                    controller.signal,
                    machine.id,
                  ),
                ] as const,
            ),
        );
        if (!controller.signal.aborted) {
          setData({
            projects,
            sessions,
            conversations: Object.fromEntries(entries),
          });
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("Offline · saved information may be stale");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [machine.id, revision]);
  function open(sid: string, cid?: string) {
    if (active) onSelect(sid, cid);
    else
      window.location.assign(
        `/chat?backend=${encodeURIComponent(machine.id)}&session=${encodeURIComponent(sid)}${cid ? `&conversation=${encodeURIComponent(cid)}` : ""}`,
      );
  }
  async function create(sid: string) {
    try {
      setActionError("");
      const requestId = attempts.current[sid] ?? crypto.randomUUID();
      attempts.current[sid] = requestId;
      const row = await api<ConversationSummary>(
        `/sessions/${sid}/conversations`,
        "POST",
        { requestId },
        undefined,
        machine.id,
      );
      delete attempts.current[sid];
      refresh();
      open(sid, row.id);
    } catch (cause) {
      setActionError((cause as Error).message);
    }
  }
  function agents(sid: string, parentId?: string): ReactNode {
    const all = data?.conversations[sid] ?? [];
    return all
      .filter(
        (item) =>
          item.parentId === parentId ||
          (!parentId &&
            item.parentId &&
            !all.some((row) => row.id === item.parentId)),
      )
      .map((item) => {
        const chosen =
          active &&
          selected === sid &&
          (conversationId ? conversationId === item.id : item.name === "Main");
        const label = (
          <>
            <MessageSquareIcon className="size-3 shrink-0" />
            {nameLabel(item.name, `/sessions/${sid}/conversations/${item.id}`)}
            {!item.name.endsWith(`#${item.id}`) && (
              <span className="text-[10px] text-muted-foreground">
                #{item.id}
              </span>
            )}
          </>
        );
        const actions = (
          <RowActions
            name={item.name}
            onRename={() =>
              startRename(
                `/sessions/${sid}/conversations/${item.id}`,
                item.name,
              )
            }
            path={`/sessions/${sid}/conversations/${item.id}`}
            machineId={machine.id}
            refresh={refresh}
          />
        );
        return (
          <div key={item.id} className={chosen ? "bg-accent" : ""}>
            {all.some((child) => child.parentId === item.id) ? (
              <Branch
                initial
                editing={
                  edit?.path === `/sessions/${sid}/conversations/${item.id}`
                }
                onActivate={() => open(sid, item.id)}
                label={label}
                actions={actions}
              >
                {agents(sid, item.id)}
              </Branch>
            ) : (
              <div className="group relative flex items-center">
                {edit?.path === `/sessions/${sid}/conversations/${item.id}` ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2">
                    {label}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-current={chosen ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left text-xs hover:bg-accent"
                    onClick={() => open(sid, item.id)}
                  >
                    {label}
                  </button>
                )}
                {actions}
              </div>
            )}
          </div>
        );
      });
  }
  const projects = [
    ...(data?.projects ?? []),
    ...(data?.sessions.some((item) => !item.workspaceId)
      ? [{ id: "", name: "No project", path: "" }]
      : []),
  ];
  return (
    <Branch
      initial={active}
      label={
        <>
          <MonitorIcon className="size-3.5 shrink-0" />
          <span className="truncate font-medium">{machine.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {machine.local ? "local" : "remote"} ·{" "}
            {error
              ? "offline"
              : data
                ? `${data.sessions.length} sessions`
                : "connecting"}
          </span>
        </>
      }
      actions={
        <Link
          className="p-1"
          href={`/machines?backend=${encodeURIComponent(machine.id)}`}
          onClick={() => selectMachine(machine.id)}
          aria-label={`Configure ${machine.name}`}
        >
          <SettingsIcon className="size-3.5" />
        </Link>
      }
    >
      {error && (
        <p role="status" className="p-2 text-xs text-muted-foreground">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="p-2 text-xs text-destructive">
          {actionError}
        </p>
      )}
      {!projects.length && !error && (
        <Link
          href={`/workspaces?backend=${encodeURIComponent(machine.id)}`}
          onClick={() => selectMachine(machine.id)}
          className="block p-2 text-xs underline"
        >
          Add project
        </Link>
      )}
      {projects.map((project) => (
        <Branch
          key={project.id}
          initial={active}
          editing={edit?.path === `/workspaces/${project.id}`}
          label={
            <>
              <FolderIcon className="size-3 shrink-0" />
              {nameLabel(project.name, `/workspaces/${project.id}`)}
            </>
          }
          actions={
            <>
              {
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`New session in ${project.name}`}
                  onClick={() =>
                    active
                      ? onNew(project.id)
                      : window.location.assign(
                          `/chat?backend=${encodeURIComponent(machine.id)}&workspace=${encodeURIComponent(project.id)}&new=1`,
                        )
                  }
                >
                  <PlusIcon className="size-3" />
                </Button>
              }
              {project.id && (
                <RowActions
                  name={project.name}
                  onRename={() =>
                    startRename(`/workspaces/${project.id}`, project.name)
                  }
                  path={`/workspaces/${project.id}`}
                  machineId={machine.id}
                  refresh={refresh}
                />
              )}
            </>
          }
        >
          {data?.sessions
            .filter((item) => (item.workspaceId ?? "") === project.id)
            .map((item) => (
              <Branch
                key={item.id}
                initial={active && item.id === selected}
                editing={edit?.path === `/sessions/${item.id}`}
                label={nameLabel(item.name, `/sessions/${item.id}`)}
                actions={
                  <RowActions
                    name={item.name}
                    onRename={() =>
                      startRename(`/sessions/${item.id}`, item.name)
                    }
                    path={`/sessions/${item.id}`}
                    machineId={machine.id}
                    refresh={refresh}
                    create={() => void create(item.id)}
                  />
                }
              >
                {agents(item.id)}
              </Branch>
            ))}
        </Branch>
      ))}
    </Branch>
  );
}

"use client";

import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBackend } from "@/components/console-shell";
import { ProjectDialog } from "@/components/project-dialog";
import { type TreeAction, TreeRow } from "@/components/tree-row";
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
  name,
  children,
  actions,
  initial = false,
  onActivate,
  editing,
  quickAction,
  selected = false,
  revealKey,
}: {
  label: ReactNode;
  name: string;
  children: ReactNode;
  actions?: TreeAction[];
  initial?: boolean;
  onActivate?: () => void;
  editing?: boolean;
  quickAction?: TreeAction;
  selected?: boolean;
  revealKey?: string;
}) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    if (revealKey) setOpen(true);
  }, [revealKey]);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <TreeRow
        name={name}
        actions={editing ? [] : actions}
        quickAction={quickAction}
        className={selected ? "bg-accent" : ""}
      >
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
            className="group flex min-w-0 flex-1 items-center gap-1.5 p-1 text-left text-xs"
          >
            <ChevronRightIcon className="size-3 shrink-0 group-data-[panel-open]:rotate-90" />
            {label}
          </CollapsibleTrigger>
        )}
      </TreeRow>
      <CollapsibleContent>
        <div className="ml-2 border-l pl-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
export function NetworkSidebar({
  selected,
  creating,
  conversationId,
  onSelect,
  onNew,
}: {
  selected: string;
  creating?: boolean;
  conversationId?: string;
  onSelect: (sessionId: string, conversationId?: string) => void;
  onNew: (projectId: string) => void;
}) {
  const { connections, id } = useBackend();
  return (
    <nav aria-label="Machine network" className="relative p-2">
      {connections.map((machine) => (
        <MachineBranch
          key={machine.id}
          machine={machine}
          active={machine.id === id}
          selected={selected}
          creating={creating}
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
  creating,
  active,
  selected,
  conversationId,
  onSelect,
  onNew,
}: {
  machine: BackendConnection;
  creating?: boolean;
  active: boolean;
  selected: string;
  conversationId?: string;
  onSelect: (id: string, cid?: string) => void;
  onNew: (id: string) => void;
}) {
  const { select: selectMachine } = useBackend();
  const router = useRouter();
  const [data, setData] = useState<{
    projects: Workspace[];
    sessions: SessionSummary[];
    conversations: Record<string, ConversationSummary[]>;
  }>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState("");
  const [addingProject, setAddingProject] = useState(false);
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
  function rowActions(
    name: string,
    path: string,
    trashPath = path,
  ): TreeAction[] {
    return [
      { label: "Rename", icon: PencilIcon, run: () => startRename(path, name) },
      {
        label: "Move to Trash",
        icon: TrashIcon,
        destructive: true,
        run: async () => {
          try {
            setActionError("");
            await api(trashPath, "DELETE", undefined, undefined, machine.id);
            window.dispatchEvent(
              new CustomEvent("console:tree-deleted", {
                detail: { machineId: machine.id, path: trashPath },
              }),
            );
            refresh();
          } catch (cause) {
            setActionError((cause as Error).message);
          }
        },
      },
    ];
  }
  function navigate(path: string) {
    selectMachine(machine.id);
    router.push(path);
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
          (conversationId
            ? conversationId === item.id
            : item.isMain || item.name === "Main");
        const name =
          (item.isMain || item.name === "Main") && item.name === "Main"
            ? (data?.sessions.find((session) => session.id === sid)?.name ??
              item.name)
            : item.name;
        const label = (
          <>
            <MessageSquareIcon className="size-3 shrink-0" />
            {nameLabel(name, `/sessions/${sid}/conversations/${item.id}`)}
            {!item.isMain && !item.name.endsWith(`#${item.id}`) && (
              <span className="ml-auto shrink-0 pr-1 text-[10px] text-muted-foreground group-hover/row:hidden group-focus-within/row:hidden [@media(hover:none)]:hidden">
                #{item.id}
              </span>
            )}
          </>
        );
        const actions = rowActions(
          name,
          `/sessions/${sid}/conversations/${item.id}`,
          all.length === 1
            ? `/sessions/${sid}`
            : `/sessions/${sid}/conversations/${item.id}`,
        );
        return (
          <div key={item.id}>
            {all.some((child) => child.parentId === item.id) ? (
              <Branch
                name={name}
                selected={Boolean(chosen)}
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
              <TreeRow
                className={chosen ? "bg-accent" : ""}
                name={name}
                actions={
                  edit?.path === `/sessions/${sid}/conversations/${item.id}`
                    ? []
                    : actions
                }
              >
                {edit?.path === `/sessions/${sid}/conversations/${item.id}` ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2">
                    {label}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-current={chosen ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left text-xs"
                    onClick={() => open(sid, item.id)}
                  >
                    {label}
                  </button>
                )}
              </TreeRow>
            )}
          </div>
        );
      });
  }
  function newConversation(project: Workspace) {
    if (creating || error || (project.state && project.state !== "ready"))
      return;
    if (active) onNew(project.id);
    else
      navigate(
        `/chat?backend=${encodeURIComponent(machine.id)}&workspace=${encodeURIComponent(project.id)}&new=1`,
      );
  }
  const projects = data?.projects ?? [];
  return (
    <>
      <Branch
        name={machine.name}
        initial={active}
        label={
          <>
            <MonitorIcon className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {machine.name}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground group-hover/row:hidden group-focus-within/row:hidden [@media(hover:none)]:hidden">
              {machine.local ? "local" : "remote"} ·{" "}
              {error
                ? "offline"
                : data
                  ? `${data.sessions.length} conversations`
                  : "connecting"}
            </span>
          </>
        }
        actions={[
          {
            label: "Machine settings",
            icon: SettingsIcon,
            run: () =>
              navigate(
                `/settings?section=machine&backend=${encodeURIComponent(machine.id)}`,
              ),
          },
          {
            label: "Add project",
            icon: FolderPlusIcon,
            run: () => setAddingProject(true),
          },
        ]}
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
        <Branch
          name="Projects"
          initial
          label={
            <span className="min-w-0 flex-1 text-muted-foreground">
              Projects
            </span>
          }
          quickAction={{
            label: `Add project on ${machine.name}`,
            icon: PlusIcon,
            run: () => setAddingProject(true),
          }}
        >
          {projects.map((project) => (
            <Branch
              key={project.id}
              name={project.name}
              initial={active}
              revealKey={
                data?.sessions.some(
                  (item) =>
                    item.id === selected && item.workspaceId === project.id,
                )
                  ? `${selected}:${conversationId ?? ""}`
                  : undefined
              }
              quickAction={{
                label: `New conversation in ${project.name}`,
                icon: PlusIcon,
                disabled:
                  creating ||
                  Boolean(error) ||
                  Boolean(project.state && project.state !== "ready"),
                run: () => newConversation(project),
              }}
              editing={edit?.path === `/workspaces/${project.id}`}
              label={
                <>
                  <FolderIcon className="size-3 shrink-0" />
                  {nameLabel(project.name, `/workspaces/${project.id}`)}
                </>
              }
              actions={[
                {
                  label: "New conversation",
                  icon: PlusIcon,
                  disabled:
                    creating ||
                    Boolean(error) ||
                    Boolean(project.state && project.state !== "ready"),
                  run: () => newConversation(project),
                },
                ...(project.id
                  ? [
                      {
                        label: "Project settings",
                        icon: SettingsIcon,
                        run: () => {
                          if (active)
                            window.dispatchEvent(
                              new CustomEvent("console:inspect-project", {
                                detail: project.id,
                              }),
                            );
                          else
                            navigate(
                              `/chat?backend=${encodeURIComponent(machine.id)}&inspect=project&workspace=${encodeURIComponent(project.id)}`,
                            );
                        },
                      },
                      ...(!project.isDefault
                        ? rowActions(project.name, `/workspaces/${project.id}`)
                        : []),
                    ]
                  : []),
              ]}
            >
              {data?.sessions
                .filter((item) => (item.workspaceId ?? "") === project.id)
                .map((item) => (
                  <div key={item.id}>{agents(item.id)}</div>
                ))}
            </Branch>
          ))}
        </Branch>
      </Branch>
      <ProjectDialog
        open={addingProject}
        machineId={machine.id}
        machineName={machine.name}
        onClose={() => setAddingProject(false)}
        onCreated={refresh}
      />
    </>
  );
}

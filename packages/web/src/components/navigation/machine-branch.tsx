"use client";

import {
  BotIcon,
  FolderIcon,
  FolderPlusIcon,
  GitForkIcon,
  MessageSquareIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useBackend } from "@/components/machines/connection-context";
import { useProjectTree } from "@/components/machines/use-project-tree";
import { type TreeAction, TreeRow } from "@/components/navigation/tree-row";
import { ProjectDialog } from "@/components/projects/dialog";
import { api, type BackendConnection, type Workspace } from "@/lib/api";
import { Branch } from "./branch";

export function MachineBranch({
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
  const { data, error, refresh } = useProjectTree(machine.id);
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
            {item.kind === "fork" ? (
              <GitForkIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : item.kind === "subagent" ? (
              <BotIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <MessageSquareIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
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
                storageKey={`console.tree:${JSON.stringify([machine.id, "conversation", sid, item.id])}`}
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
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-1">
                    <span className="size-5 shrink-0" aria-hidden="true" />
                    {label}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-current={chosen ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-1 text-left text-xs"
                    onClick={() => open(sid, item.id)}
                  >
                    <span className="size-5 shrink-0" aria-hidden="true" />
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
        storageKey={`console.tree:${JSON.stringify([machine.id, "machine"])}`}
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
                  ? `${Object.values(data.conversations).reduce((total, rows) => total + rows.length, 0)} chats`
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
          storageKey={`console.tree:${JSON.stringify([machine.id, "projects"])}`}
          initial
          indentChildren={false}
          label={
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
              storageKey={`console.tree:${JSON.stringify([machine.id, "project", project.id])}`}
              initial={active}
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
                  <FolderIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
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

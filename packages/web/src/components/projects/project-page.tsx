"use client";
import { RefreshCw, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ProjectGit } from "./project-git";
import { ProjectIcon, ProjectIconPicker } from "./project-icon";
import { ProjectRemovalDialog } from "./project-removal-dialog";
import { type Project, useMachineProjects } from "./projects-provider";

export function ProjectPage({ settings = false }: { settings?: boolean }) {
  const { deviceId, projectId } = useParams<{
    deviceId: string;
    projectId: string;
  }>();
  const state = useMachineProjects(deviceId);
  if (!state.connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from the first column.
      </p>
    );
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  const project = state.projects?.find((p) => p.id === projectId);
  if (!project)
    return (
      <p className="text-sm text-muted-foreground">
        {state.projects ? "Project not found." : "Loading project…"}
      </p>
    );
  if (settings)
    return (
      <ProjectEditor
        key={project.id}
        project={project}
        state={state}
        deviceId={deviceId}
      />
    );
  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <ProjectIcon
          icon={project.icon}
          color={project.color}
          className="size-5"
        />
        <h1 className="text-xl font-semibold">{project.name}</h1>
      </header>
      <p className="text-sm text-muted-foreground">No sessions yet.</p>
    </div>
  );
}
function ProjectEditor({
  project,
  state,
  deviceId,
}: {
  project: Project;
  state: ReturnType<typeof useMachineProjects>;
  deviceId: string;
}) {
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon);
  const [color, setColor] = useState(project.color);
  const [persisted, setPersisted] = useState({
    name: project.name,
    icon: project.icon,
    color: project.color,
  });
  const dirty =
    name.trim() !== persisted.name ||
    icon !== persisted.icon ||
    color !== persisted.color;
  const [gitLoading, setGitLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  const router = useRouter();
  const endpoint = `/v1/projects/${encodeURIComponent(project.id)}`;
  async function run(action: "save" | "check") {
    if (busy || (action === "save" && (!dirty || !name.trim()))) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      if (action === "save") {
        const updated = await state.request<Project>(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, icon, color }),
        });
        setPersisted({
          name: updated.name,
          icon: updated.icon,
          color: updated.color,
        });
      }
      await state.refresh();
      if (action === "check") setRevision((value) => value + 1);
      if (action === "save") setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update project.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="@container w-full min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-semibold">{project.name}</h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh project metadata"
            title="Refresh project metadata"
            disabled={busy || gitLoading}
            onClick={() => void run("check")}
          >
            <RefreshCw
              className={cn(
                "size-4",
                (busy || gitLoading) && "motion-safe:animate-spin",
              )}
            />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {dirty && (
            <Button
              type="submit"
              form="project-details"
              disabled={busy || !name.trim()}
            >
              Save changes
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        </div>
      </header>
      {confirm && (
        <ProjectRemovalDialog
          project={project}
          deviceId={deviceId}
          onClose={() => setConfirm(false)}
          onRemoved={() =>
            router.push(`/devices/${encodeURIComponent(deviceId)}`)
          }
        />
      )}
      <div className="grid items-start gap-6 @3xl:grid-cols-2">
        <form
          id="project-details"
          className="min-w-0 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("save");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="project-name" className="pl-10">
              Name
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <ProjectIconPicker
                disabled={busy}
                icon={icon}
                color={color}
                onChange={(i, c) => {
                  setIcon(i);
                  setColor(c);
                  setSaved(false);
                }}
              />
              <Input
                className="flex-1 basis-48 border-0 bg-muted/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                spellCheck={false}
                id="project-name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                disabled={busy}
              />
            </div>
          </div>
        </form>
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">Directory</p>
            <span
              role="img"
              aria-label={
                project.available
                  ? "Directory accessible"
                  : "Directory unavailable"
              }
              title={
                project.available
                  ? "Directory accessible"
                  : project.unavailableReason
              }
              className={cn(
                "size-1.5 shrink-0",
                project.available ? "bg-emerald-500" : "bg-red-500",
              )}
            />
          </div>
          <div className="flex min-h-8 items-center">
            <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
              {project.path}
            </p>
          </div>
        </div>
      </div>
      <ProjectGit
        key={`${project.id}:${revision}`}
        projectId={project.id}
        path={project.path}
        request={state.request}
        onLoadingChange={setGitLoading}
      />
      <span role="status" className="sr-only">
        {dirty ? "Unsaved changes" : saved ? "Changes saved" : ""}
      </span>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

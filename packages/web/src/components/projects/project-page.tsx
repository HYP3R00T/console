"use client";
import { FolderOpen, RefreshCw, SquarePen } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ProjectSessions } from "@/components/sessions/project-sessions";
import { useProjectNavigation } from "@/components/sessions/use-project-navigation";
import { SettingsDisclosure } from "@/components/settings/settings-presentation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ProjectGit } from "./project-git";
import { ProjectIcon, ProjectIconPicker } from "./project-icon";
import { ProjectWorkflows } from "./project-workflows";
import { type Project, useMachineProjects } from "./projects-provider";

export function ProjectPage({
  settings = false,
  embedded = false,
  projectId: targetProjectId,
}: {
  settings?: boolean;
  embedded?: boolean;
  projectId?: string;
}) {
  const { deviceId, projectId: routeProjectId } = useParams<{
    deviceId: string;
    projectId: string;
  }>();
  const projectId = targetProjectId ?? routeProjectId;
  const state = useMachineProjects(deviceId);
  if (!state.connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from Manage devices.
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
        embedded={embedded}
      />
    );
  return (
    <ProjectWorkspace key={project.id} deviceId={deviceId} project={project} />
  );
}
function ProjectWorkspace({
  project,
  deviceId,
}: {
  project: Project;
  deviceId: string;
}) {
  const { state, create, busy, error } = useProjectNavigation(
    deviceId,
    project.id,
    project.available,
  );
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <ProjectIcon
          icon={project.icon}
          color={project.color}
          className="size-5"
        />
        <h1 className="flex-1 text-xl font-semibold">{project.name}</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`New conversation in ${project.name}`}
          disabled={busy || !project.available}
          onClick={() => void create()}
        >
          <SquarePen className="size-4" />
        </Button>
      </header>
      {(error || state.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error ?? state.error}
        </p>
      )}
      <ProjectSessions
        deviceId={deviceId}
        projectId={project.id}
        sessions={state.sessions}
        busy={busy}
        createConversation={(sessionId) => void create(sessionId)}
      />
      <ProjectWorkflows
        projectId={project.id}
        deviceId={deviceId}
        sessions={state.sessions}
      />
    </div>
  );
}
function ProjectEditor({
  project,
  state,
  embedded,
}: {
  project: Project;
  state: ReturnType<typeof useMachineProjects>;
  embedded: boolean;
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
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
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
  const identityForm = (
    <form
      id={`project-details-${project.id}`}
      className="flex min-w-0 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run("save");
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`project-name-${project.id}`}>
            Project name
          </FieldLabel>
          <div className="flex items-center gap-2">
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
              className="min-w-0 flex-1"
              spellCheck={false}
              id={`project-name-${project.id}`}
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
        </Field>
      </FieldGroup>
      {dirty && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save identity"}
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => {
              setName(persisted.name);
              setIcon(persisted.icon);
              setColor(persisted.color);
            }}
          >
            Discard
          </Button>
        </div>
      )}
    </form>
  );
  return (
    <div className="@container flex w-full min-w-0 flex-col gap-4">
      <header className="flex min-w-0 items-center gap-2">
        <ProjectIcon
          icon={project.icon}
          color={project.color}
          className="size-4 shrink-0"
        />
        <h2
          className={cn(
            "min-w-0 flex-1 truncate font-semibold",
            embedded ? "text-sm" : "text-xl",
          )}
        >
          {project.name}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh project metadata"
          disabled={busy || gitLoading}
          onClick={() => void run("check")}
        >
          <RefreshCw
            className={cn((busy || gitLoading) && "motion-safe:animate-spin")}
          />
        </Button>
      </header>
      <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
        <FolderOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="wrap-anywhere font-mono">{project.path}</p>
          <p className="mt-1">
            {project.available
              ? "Directory accessible"
              : (project.unavailableReason ?? "Directory unavailable")}
          </p>
        </div>
      </div>
      {embedded ? (
        <SettingsDisclosure title="Name & icon">
          {identityForm}
        </SettingsDisclosure>
      ) : (
        identityForm
      )}
      <Separator />
      <ProjectGit
        key={`${project.id}:${revision}`}
        compact={embedded}
        projectId={project.id}
        path={project.path}
        request={state.request}
        onLoadingChange={setGitLoading}
      />
      <span
        role="status"
        className={saved ? "text-xs text-muted-foreground" : "sr-only"}
      >
        {dirty ? "Unsaved identity changes" : saved ? "Identity saved" : ""}
      </span>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

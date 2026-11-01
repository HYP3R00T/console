"use client";
import {
  ArrowRight,
  FolderOpen,
  GitBranch,
  Plus,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMachineProjects } from "./projects-provider";

type Mode = "existing" | "create" | "clone";
const choices = [
  {
    id: "existing",
    name: "Existing directory",
    description: "Register work already on this machine",
    icon: FolderOpen,
  },
  {
    id: "create",
    name: "New project",
    description: "Create a folder with Git initialized",
    icon: Plus,
  },
  {
    id: "clone",
    name: "Clone repository",
    description: "Bring in a public HTTPS repository",
    icon: GitBranch,
  },
] as const;
const basename = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() ?? "";
const folderName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
export function ProjectSetup() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const {
    connected,
    settings,
    device,
    error: loadError,
    projects,
    request,
    refresh,
  } = useMachineProjects(deviceId);
  const [mode, setMode] = useState<Mode>("existing");
  const [nameInput, setNameInput] = useState<string>();
  const [folderInput, setFolderInput] = useState<string>();
  const [pathInput, setPathInput] = useState<string>();
  const [repository, setRepository] = useState("");
  const [createParents, setCreateParents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const router = useRouter();
  const base = `/devices/${encodeURIComponent(deviceId)}`;
  const suggestedName =
    mode === "clone"
      ? basename(repository).replace(/\.git$/, "")
      : mode === "existing" && pathInput
        ? basename(pathInput)
        : "";
  const name = nameInput ?? suggestedName;
  const folder = folderInput ?? folderName(name);
  const root = settings?.projectsRoot ?? "";
  const destination = root ? `${root.replace(/[\\/]+$/, "")}/${folder}` : "";
  const path = mode === "existing" ? (pathInput ?? destination) : destination;
  const registered = projects?.some((p) => p.path === path);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError(undefined);
    try {
      const result = await request<{ id: string }>(
        mode === "existing" ? "/v1/projects" : `/v1/projects/${mode}`,
        {
          method: "POST",
          body: JSON.stringify(
            mode === "existing"
              ? { name, path }
              : {
                  name,
                  folder,
                  createParents,
                  ...(mode === "clone" ? { repository } : {}),
                },
          ),
          signal: operation.signal,
        },
        mode === "existing" ? 20000 : 125000,
      );
      await refresh();
      if (!operation.signal.aborted)
        router.push(`${base}/projects/${encodeURIComponent(result.id)}`);
    } catch (cause) {
      setError(
        operation.signal.aborted
          ? "Setup cancelled. Check the destination before retrying."
          : cause instanceof Error
            ? cause.message
            : "Could not set up project.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!connected)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Add project</h1>
        <p className="text-sm text-muted-foreground">
          Connect this machine from the first column.
        </p>
      </div>
    );
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Add project</h1>
        <p className="mt-2 text-sm text-muted-foreground">{device?.name}</p>
      </header>
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setNameInput(undefined);
          setFolderInput(undefined);
          setError(undefined);
        }}
        className="gap-7"
      >
        <TabsList className="grid h-auto! w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-3">
          {choices.map((choice) => (
            <TabsTrigger
              key={choice.id}
              value={choice.id}
              disabled={busy}
              className="h-auto items-start justify-start gap-3 bg-muted/20 p-4 text-left whitespace-normal"
            >
              <choice.icon className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{choice.name}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {choice.description}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={mode}>
          <form
            onSubmit={submit}
            className="grid items-start gap-8 xl:grid-cols-3 xl:gap-2"
          >
            <div className="min-w-0 space-y-5 xl:col-span-2 xl:pr-6">
              {(error || loadError) && (
                <p role="alert" className="text-sm text-destructive">
                  {error ?? loadError}
                </p>
              )}
              {mode === "clone" && (
                <div className="space-y-2">
                  <Label htmlFor="project-repository">Repository URL</Label>
                  <Input
                    id="project-repository"
                    type="url"
                    placeholder="https://github.com/owner/repository.git"
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                    disabled={busy}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Public HTTPS only. No machine credentials are used.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="My project"
                  maxLength={120}
                  required
                  disabled={busy}
                />
              </div>
              {mode === "existing" ? (
                <div className="space-y-2">
                  <Label htmlFor="project-directory">Existing directory</Label>
                  <Input
                    id="project-directory"
                    value={path}
                    onChange={(e) => setPathInput(e.target.value)}
                    placeholder="/absolute/path/to/project"
                    required
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    Files and Git configuration stay untouched.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="project-folder">Folder name</Label>
                    <Input
                      id="project-folder"
                      value={folder}
                      onChange={(e) => setFolderInput(e.target.value)}
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,79}"
                      maxLength={80}
                      placeholder="my-project"
                      required
                      disabled={busy}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="project-parents"
                      checked={createParents}
                      onCheckedChange={(value) => setCreateParents(!!value)}
                      disabled={busy}
                    />
                    <Label htmlFor="project-parents">
                      Create missing parent folders
                    </Label>
                  </div>
                </>
              )}
              {registered && (
                <p role="alert" className="text-sm text-destructive">
                  This directory is already registered.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !settings ||
                    !name.trim() ||
                    !path ||
                    registered ||
                    (mode === "clone" && !repository)
                  }
                >
                  {busy
                    ? mode === "clone"
                      ? "Cloning…"
                      : "Setting up…"
                    : mode === "existing"
                      ? "Add project"
                      : mode === "create"
                        ? "Create project"
                        : "Clone repository"}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>
                {busy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => controller.current?.abort()}
                  >
                    Cancel setup
                  </Button>
                ) : (
                  <Button
                    nativeButton={false}
                    variant="ghost"
                    render={<Link href={base} />}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <aside className="min-w-0 space-y-5 bg-muted/20 p-5">
              <div>
                <p className="text-xs text-muted-foreground">
                  Destination on {device?.name}
                </p>
                <p className="mt-2 break-all font-mono text-sm">
                  {path || "Choose a project name"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "existing"
                  ? "Register an existing directory, wherever it lives."
                  : mode === "create"
                    ? "Creates an empty Git repository. No initial commit."
                    : "Clones the repository without submodules or personal Git configuration."}
              </p>
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="px-0"
                render={<Link href={`${base}/settings/projects`} />}
                disabled={busy}
              >
                <Settings2 className="size-4" />
                Projects folder settings
              </Button>
            </aside>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

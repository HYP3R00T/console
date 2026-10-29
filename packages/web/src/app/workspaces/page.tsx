"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash } from "@/components/navigation/trash";
import { ChoiceSelect } from "@/components/shared/choice-select";
import { Button } from "@/components/ui/button";
import { api, fieldClass, type Workspace } from "@/lib/api";

type Creation = {
  name: string;
  path: string;
  repository?: string;
  createDirectory: boolean;
  requestId: string;
};
export default function Projects() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [repository, setRepository] = useState("");
  const [mode, setMode] = useState("repository");
  const [createDirectory, setCreateDirectory] = useState(false);
  const [attempt, setAttempt] = useState<Creation>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const rows = await api<Workspace[]>(
          "/workspaces",
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) setWorkspaces(rows);
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  async function act(operation: () => Promise<void>) {
    setError("");
    setWorking(true);
    try {
      await operation();
      setWorkspaces(await api<Workspace[]>("/workspaces"));
      setRevision((value) => value + 1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-5 sm:p-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Selected machine
        </p>
        <h1 className="text-3xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Clone a repository or register a directory. Sessions work within that
          project on this machine.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <form
        className="grid gap-4 border p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = attempt ?? {
            name,
            path,
            repository: mode === "repository" ? repository : undefined,
            createDirectory,
            requestId: crypto.randomUUID(),
          };
          setAttempt(input);
          void act(async () => {
            await api("/workspaces", "POST", input);
            setAttempt(undefined);
            setName("");
            setPath("");
            setRepository("");
          });
        }}
      >
        <h2 className="font-medium sm:col-span-2">Add a project</h2>
        <div className="space-y-2 text-sm">
          <span>Source</span>
          <ChoiceSelect
            label="Project source"
            value={mode}
            items={[
              { value: "repository", label: "Clone a GitHub repository" },
              { value: "directory", label: "Local directory on this machine" },
            ]}
            disabled={working || Boolean(attempt)}
            onChange={setMode}
          />
        </div>
        <label className="space-y-2 text-sm">
          Project name
          <input
            className={fieldClass}
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={working || Boolean(attempt)}
          />
        </label>
        {mode === "repository" && (
          <label className="space-y-2 text-sm sm:col-span-2">
            Public GitHub repository
            <input
              className={fieldClass}
              type="url"
              required
              placeholder="https://github.com/owner/repository"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              disabled={working || Boolean(attempt)}
            />
          </label>
        )}
        <label className="space-y-2 text-sm sm:col-span-2">
          Destination on this machine
          <input
            className={fieldClass}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="Leave blank to use the machine's project directory"
            disabled={working || Boolean(attempt)}
          />
        </label>
        {mode === "directory" && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={createDirectory}
              onChange={(event) => setCreateDirectory(event.target.checked)}
              disabled={working || Boolean(attempt)}
            />
            Create the directory if missing
          </label>
        )}
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Cloning does not run repository scripts. Once ready, create a session
          and explicitly enable sandboxed commands and writable/network grants
          to ask the agent to install dependencies and verify setup.
        </p>
        <div className="flex gap-2">
          <Button type="submit" disabled={working}>
            {attempt
              ? "Retry request"
              : mode === "repository"
                ? "Clone project"
                : "Register project"}
          </Button>
          {attempt && !working && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAttempt(undefined)}
            >
              Edit request
            </Button>
          )}
        </div>
      </form>
      <section className="space-y-3" aria-label="Projects">
        {workspaces.map((workspace) => (
          <article key={workspace.id} className="space-y-3 border p-5">
            <form
              className="flex gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void act(async () => {
                  await api(`/workspaces/${workspace.id}`, "PATCH", {
                    name: String(form.get("name")),
                  });
                });
              }}
            >
              <input
                name="name"
                aria-label={`Name for ${workspace.name}`}
                className={fieldClass}
                defaultValue={workspace.name}
                required
                maxLength={80}
              />
              <Button type="submit" variant="outline" disabled={working}>
                Rename
              </Button>
            </form>
            <p className="wrap-break-word font-mono text-xs text-muted-foreground">
              {workspace.path}
            </p>
            <p role="status" className="text-xs text-muted-foreground">
              {workspace.state || "ready"}
              {workspace.repository ? ` · ${workspace.repository}` : ""}
            </p>
            {workspace.error && (
              <p className="text-xs text-destructive">{workspace.error}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {(!workspace.state || workspace.state === "ready") && (
                <Link
                  href={`/chat?workspace=${workspace.id}&new=1`}
                  className="inline-block text-sm underline"
                >
                  Create session
                </Link>
              )}
              {["failed", "interrupted"].includes(workspace.state || "") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void act(async () => {
                      await api(`/workspaces/${workspace.id}/retry`, "POST");
                    })
                  }
                >
                  Retry clone
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={working}
                onClick={() =>
                  void act(async () => {
                    await api(`/workspaces/${workspace.id}`, "DELETE");
                  })
                }
              >
                Delete project
              </Button>
            </div>
          </article>
        ))}
      </section>
      <Trash
        key={revision}
        kind="projects"
        onRestore={() => void act(async () => {})}
      />
    </main>
  );
}

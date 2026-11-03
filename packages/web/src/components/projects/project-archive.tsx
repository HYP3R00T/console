"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Project, useMachineProjects } from "./projects-provider";

export function ProjectArchive({ deviceId }: { deviceId: string }) {
  const { request, refresh } = useMachineProjects(deviceId);
  const [projects, setProjects] = useState<Project[]>();
  const [error, setError] = useState<string>();
  const [restoring, setRestoring] = useState<string>();
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await request<{ projects: Project[] }>(
          "/v1/projects/archive",
          { signal },
        );
        setProjects(data.projects);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load archive.",
          );
      }
    },
    [request],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function restore(project: Project) {
    setRestoring(project.id);
    setError(undefined);
    try {
      await request(`/v1/projects/${encodeURIComponent(project.id)}/restore`, {
        method: "POST",
      });
      await Promise.all([refresh(), load()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not restore project.",
      );
    } finally {
      setRestoring(undefined);
    }
  }

  return (
    <section
      className="max-w-2xl space-y-3"
      aria-labelledby="project-archive-heading"
    >
      <h2 id="project-archive-heading" className="text-sm font-semibold">
        Archive
      </h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!projects?.length && !error && (
        <p className="text-sm text-muted-foreground">
          {projects ? "No archived projects." : "Loading archive…"}
        </p>
      )}
      <ul className="space-y-1">
        {projects?.map((project) => (
          <li
            key={project.id}
            className="flex items-center justify-between gap-4 bg-muted/30 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{project.name}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {project.path}
              </p>
            </div>
            <Button
              variant="ghost"
              disabled={!!restoring}
              onClick={() => void restore(project)}
              aria-label={`Restore ${project.name}`}
            >
              <RotateCcw />
              {restoring === project.id ? "Restoring…" : "Restore"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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
    const notification = toast.add({
      title: "Restoring project…",
      type: "loading",
      timeout: 0,
    });
    setRestoring(project.id);
    setError(undefined);
    try {
      await request(`/v1/projects/${encodeURIComponent(project.id)}/restore`, {
        method: "POST",
      });
      toast.update(notification, {
        title: "Project restored",
        description: project.name,
        type: "success",
        timeout: 4500,
      });
      await Promise.all([refresh(), load()]);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not restore project.";
      setError(message);
      toast.update(notification, {
        title: "Could not restore project",
        description: message,
        type: "error",
        timeout: 7000,
      });
    } finally {
      setRestoring(undefined);
    }
  }

  if (!projects?.length && !error) return null;

  return (
    <section
      className="max-w-2xl space-y-3"
      aria-labelledby="project-archive-heading"
    >
      <h2 id="project-archive-heading" className="text-sm font-semibold">
        Projects
      </h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
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
              size="xs"
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

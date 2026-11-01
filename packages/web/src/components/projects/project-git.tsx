"use client";
import { ChevronRight, GitBranch, GitFork } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { useMachineProjects } from "./projects-provider";

type GitMetadata =
  | { status: "not_repository" }
  | { status: "unavailable"; reason: string }
  | {
      status: "repository";
      root: string | null;
      bare: boolean;
      linkedWorktree: boolean;
      currentBranch: string | null;
      branches: string[];
      worktrees: {
        path: string;
        branch: string | null;
        bare: boolean;
        detached: boolean;
        locked: boolean;
        prunable: boolean;
      }[];
    };

export function ProjectGit({
  projectId,
  path,
  request,
  onLoadingChange,
}: {
  onLoadingChange: (loading: boolean) => void;
  projectId: string;
  path: string;
  request: ReturnType<typeof useMachineProjects>["request"];
}) {
  const [data, setData] = useState<GitMetadata>();
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    onLoadingChange(true);
    void request<GitMetadata>(
      `/v1/projects/${encodeURIComponent(projectId)}/git`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setData({
            status: "unavailable",
            reason:
              error instanceof Error
                ? error.message
                : "Git metadata could not be read.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) onLoadingChange(false);
      });
    return () => controller.abort();
  }, [projectId, request, onLoadingChange]);
  return (
    <section className="space-y-4 pt-4" aria-label="Git metadata">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Git</h2>
      </header>
      {!data ? (
        <p className="text-xs text-muted-foreground">Reading Git…</p>
      ) : data.status === "not_repository" ? (
        <p className="text-xs text-muted-foreground">No Git repository</p>
      ) : data.status === "unavailable" ? (
        <p role="status" className="text-xs text-muted-foreground">
          {data.reason}
        </p>
      ) : (
        <>
          {data.bare && (
            <p className="text-xs text-muted-foreground">Bare repository</p>
          )}
          {!data.bare && !data.currentBranch && (
            <p className="text-xs text-muted-foreground">Detached HEAD</p>
          )}
          {data.currentBranch &&
            !data.branches.includes(data.currentBranch) && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span aria-hidden="true" className="size-1.5 bg-blue-500" />
                {data.currentBranch} · No commits yet
              </p>
            )}
          {data.root && data.root !== path && (
            <p className="break-all font-mono text-xs text-muted-foreground">
              Repository: {data.root}
            </p>
          )}
          <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Collapsible defaultOpen className="min-w-0 bg-muted/20 p-4">
              <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left text-sm font-medium">
                <GitBranch className="size-3.5" />
                Local branches
                <span className="font-normal tabular-nums text-muted-foreground">
                  {data.branches.length}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="ml-auto size-3.5 text-muted-foreground transition-transform group-aria-expanded:rotate-90"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden">
                <ul className="space-y-1 pt-4">
                  {data.branches.map((branch) => (
                    <li
                      key={branch}
                      aria-current={
                        branch === data.currentBranch ? "true" : undefined
                      }
                      className={`flex items-center gap-3 break-all px-2 py-1.5 text-xs ${branch === data.currentBranch ? "bg-muted font-medium" : "text-muted-foreground"}`}
                    >
                      <span
                        aria-hidden="true"
                        title={
                          branch === data.currentBranch
                            ? "Current branch"
                            : undefined
                        }
                        className={`size-1.5 shrink-0 ${branch === data.currentBranch ? "bg-blue-500" : "bg-transparent"}`}
                      />
                      <span>{branch}</span>
                    </li>
                  ))}
                </ul>
                {!data.branches.length && (
                  <p className="py-2 text-xs text-muted-foreground">
                    No local branches
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
            <Collapsible defaultOpen className="min-w-0 bg-muted/20 p-4">
              <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left text-sm font-medium">
                <GitFork className="size-3.5" />
                Worktrees
                <span className="font-normal tabular-nums text-muted-foreground">
                  {data.worktrees.length}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="ml-auto size-3.5 text-muted-foreground transition-transform group-aria-expanded:rotate-90"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden">
                <ul className="space-y-4 pt-4">
                  {data.worktrees.map((tree, index) => (
                    <li
                      key={tree.path}
                      aria-current={
                        tree.path === data.root ? "true" : undefined
                      }
                      className={`flex items-start gap-3 px-2 py-1.5 ${tree.path === data.root ? "bg-muted" : ""}`}
                    >
                      <span
                        aria-hidden="true"
                        title={
                          tree.path === data.root
                            ? "Current worktree"
                            : undefined
                        }
                        className={`mt-1 size-1.5 shrink-0 ${tree.path === data.root ? "bg-blue-500" : "bg-transparent"}`}
                      />
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium">
                            {tree.bare
                              ? "Bare repository"
                              : index === 0
                                ? "Main"
                                : tree.path
                                    .split(/[\\/]/)
                                    .filter(Boolean)
                                    .at(-1) || tree.path}
                          </span>
                          {tree.locked && (
                            <span className="text-muted-foreground">
                              Locked
                            </span>
                          )}
                          {tree.prunable && (
                            <span className="text-muted-foreground">
                              Prunable
                            </span>
                          )}
                        </div>
                        <p className="break-all font-mono text-xs text-muted-foreground">
                          {tree.path}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </>
      )}
    </section>
  );
}

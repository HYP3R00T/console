"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type Conversation } from "@/lib/api";

type Resources = {
  enabled: boolean;
  instructions: { name: string; path: string; content: string }[];
  skills: { name: string; path: string; description: string }[];
  prompts: { name: string; path: string; description: string }[];
};

export function ProjectResources({
  session,
  path,
  onUse,
  active = true,
}: {
  session: Conversation;
  path: string;
  onUse: (text: string) => void;
  active?: boolean;
}) {
  const [resources, setResources] = useState<Resources>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const available = Boolean(session.contextUsage);
  const resourceUrl = `${path}/resources?revision=${revision}`;
  useEffect(() => {
    if (!session.sandbox.enabled || !available) {
      setResources(undefined);
      return;
    }
    if (!active) return;
    const controller = new AbortController();
    void api<Resources>(resourceUrl, "GET", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResources(value);
          setError("");
        }
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [resourceUrl, session.sandbox.enabled, available, active]);
  return (
    <section aria-label="Project resources" className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Project resources</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={!session.sandbox.enabled || !session.contextUsage}
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload resources
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Project instructions load for each model request. Skills load when
        invoked; templates fill the composer through /skill:name and
        /prompt:name. Resource files grant no extra access.
      </p>
      {!session.sandbox.enabled && (
        <p className="text-xs">
          Enable the workspace policy to discover project resources.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {resources?.instructions.map((item) => (
        <details key={item.path} className="border p-2 text-xs">
          <summary>{item.path}</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word">
            {item.content}
          </pre>
        </details>
      ))}
      {(
        [
          ["skill", resources?.skills ?? []],
          ["prompt", resources?.prompts ?? []],
        ] as const
      ).map(([kind, items]) => (
        <div key={kind} className="space-y-2">
          {items.map((item) => (
            <div key={item.path} className="space-y-1 border p-2 text-xs">
              <p className="font-medium">{item.name}</p>
              <p className="text-muted-foreground">{item.description}</p>
              <p className="font-mono text-muted-foreground">{item.path}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUse(`/${kind}:${item.name} `)}
              >
                Use {kind === "skill" ? "skill" : "template"}
              </Button>
            </div>
          ))}
        </div>
      ))}
      {resources &&
        !resources.instructions.length &&
        !resources.skills.length &&
        !resources.prompts.length && (
          <p className="text-xs text-muted-foreground">
            No project resources found. Add AGENTS.md, skills under .pi/skills
            or .agents/skills, or Markdown templates under .pi/prompts in the
            project.
          </p>
        )}
    </section>
  );
}

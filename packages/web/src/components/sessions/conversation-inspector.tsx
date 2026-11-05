"use client";
import { RotateCcw } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import type { Execution } from "./conversation-state";
import { executionNeedsAttention } from "./execution-labels";
import { ExecutionStatus } from "./execution-status";

type Configuration = {
  revision: string;
  tools: {
    name: string;
    extension: string;
    description: string;
    parameters: object;
    enabled: boolean;
  }[];
  toolSource: "default" | "conversation";
  instructions: string;
  sections: { key: string; text: string }[];
};
export function ConversationInspectorLoading() {
  return (
    <div role="status" aria-busy="true" className="h-full">
      <span className="sr-only">Loading conversation details…</span>
    </div>
  );
}

export function ConversationInspector({
  path,
  request,
  working,
  execution,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  working: boolean;
  execution?: Execution;
}) {
  const prefix = useId();
  const [data, setData] = useState<Configuration>();
  const [instructions, setInstructions] = useState<string>();
  const [revision, setRevision] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const generation = useRef(0);
  const loaded = useRef(false);
  const dirty = useRef(false);
  const savingRef = useRef(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const version = generation.current;
      try {
        const next = await request<Configuration>(`${path}/configuration`, {
          signal,
        });
        if (
          signal?.aborted ||
          savingRef.current ||
          version !== generation.current
        )
          return;
        const reveal = () => {
          setLoadError(undefined);
          setData(next);
          if (!dirty.current) {
            setInstructions(next.instructions);
            setRevision(next.revision);
          }
        };
        if (loaded.current) reveal();
        else startTransition(reveal);
        loaded.current = true;
      } catch (cause) {
        if (!signal?.aborted)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Could not load configuration.",
          );
      }
    },
    [path, request],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh]);
  async function update(
    change: { tools?: string[] | null; instructions?: string | null },
    expected = data?.revision,
  ) {
    if (!expected) return;
    generation.current += 1;
    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const next = await request<Configuration>(`${path}/configuration`, {
        method: "PATCH",
        body: JSON.stringify({ revision: expected, ...change }),
      });
      setData(next);
      if (change.instructions !== undefined) {
        dirty.current = false;
        setInstructions(next.instructions);
        setRevision(next.revision);
      } else if (revision === expected) setRevision(next.revision);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save configuration.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const disabled = working || saving;
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {(error || loadError) && (
        <p role="alert" className="text-xs text-destructive">
          {error || loadError}
        </p>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="pr-2">
          {executionNeedsAttention(execution) && (
            <section
              aria-labelledby={`${prefix}-execution-heading`}
              className="border-b border-border pb-4"
            >
              <h2
                id={`${prefix}-execution-heading`}
                className="mb-3 text-sm font-semibold"
              >
                Execution
              </h2>
              <ExecutionStatus execution={execution} details />
            </section>
          )}
          <section
            id={`${prefix}-tools`}
            aria-labelledby={`${prefix}-tools-heading`}
            className="border-b border-border pb-5 pt-4"
          >
            <h2
              id={`${prefix}-tools-heading`}
              className="text-sm font-semibold"
            >
              Tools
            </h2>
            {!data && !loadError && <ConversationInspectorLoading />}
            {working && (
              <p className="py-2 text-xs text-muted-foreground">
                Editable when idle
              </p>
            )}
            <div className="flex items-center justify-between py-3 text-xs text-muted-foreground">
              <span>
                {data?.toolSource === "conversation" ? "Custom" : "Default"}
              </span>
              <ControlTooltip label="Use default tools">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Use default tools"
                  disabled={disabled || data?.toolSource !== "conversation"}
                  onClick={() => void update({ tools: null })}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </ControlTooltip>
            </div>
            {[...new Set(data?.tools.map((tool) => tool.extension))].map(
              (extension) => (
                <section key={extension} className="mb-5">
                  <h3 className="mb-2 text-xs text-muted-foreground">
                    {extension === "coding-tools" ? "Coding" : "Inspection"}
                  </h3>
                  {data?.tools
                    .filter((tool) => tool.extension === extension)
                    .map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-start gap-2 rounded-md px-1 py-2 hover:bg-accent/40"
                      >
                        <details className="min-w-0 flex-1">
                          <summary className="cursor-pointer text-xs font-medium">
                            {tool.name}
                          </summary>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {tool.description}
                          </p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                            {JSON.stringify(tool.parameters, null, 2)}
                          </pre>
                        </details>
                        <Checkbox
                          aria-label={`Enable ${tool.name}`}
                          checked={tool.enabled}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            void update({
                              tools: data.tools
                                .filter((item) =>
                                  item.name === tool.name
                                    ? checked
                                    : item.enabled,
                                )
                                .map((item) => item.name),
                            })
                          }
                        />
                      </div>
                    ))}
                </section>
              ),
            )}
          </section>
          <section
            id={`${prefix}-instructions`}
            aria-labelledby={`${prefix}-instructions-heading`}
            className="py-5"
          >
            <h2
              id={`${prefix}-instructions-heading`}
              className="text-sm font-semibold"
            >
              Instructions
            </h2>
            {!data && !loadError && <ConversationInspectorLoading />}
            {working && (
              <p className="py-2 text-xs text-muted-foreground">
                Editable when idle
              </p>
            )}
            <div className="space-y-4 py-3 pr-2">
              {data?.sections.map((section) => (
                <details key={section.key}>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {section.key === "workspace"
                      ? "Workspace"
                      : section.key === "console_project"
                        ? "Project"
                        : section.key}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {section.text}
                  </p>
                </details>
              ))}
              <label
                htmlFor="conversation-instructions"
                className="block text-xs font-medium"
              >
                Conversation
              </label>
              <Textarea
                id="conversation-instructions"
                placeholder="Add instructions…"
                value={instructions ?? ""}
                maxLength={16000}
                disabled={!data || disabled}
                onChange={(event) => {
                  dirty.current = event.target.value !== data?.instructions;
                  setInstructions(event.target.value);
                }}
                className="min-h-48 text-xs"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    disabled || !data || instructions === data.instructions
                  }
                  onClick={() => {
                    setError(undefined);
                    dirty.current = false;
                    setInstructions(data?.instructions);
                    setRevision(data?.revision);
                  }}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  disabled={
                    disabled || !data || instructions === data.instructions
                  }
                  onClick={() => void update({ instructions }, revision)}
                >
                  Save
                </Button>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

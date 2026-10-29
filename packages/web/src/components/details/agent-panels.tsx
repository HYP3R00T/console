"use client";

import { useEffect, useState } from "react";
import { SharedState } from "@/components/machines/shared-state";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { type AgentInspection, api } from "@/lib/api";
import { startPolling } from "@/lib/poll";

export type InspectorPanel = "session" | "state" | "tasks" | "tools" | "extend";
export function AgentPanels({
  path,
  panel,
  idle,
  onChanged,
  active = true,
}: {
  path: string;
  panel: InspectorPanel;
  idle: boolean;
  onChanged: () => void;
  active?: boolean;
}) {
  const [inspection, setInspection] = useState<AgentInspection>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [instructions, setInstructions] = useState<string>();
  useEffect(() => {
    if (!active || panel === "state" || panel === "session") return;
    return startPolling({
      read: (signal) =>
        api<AgentInspection>(`${path}/inspect`, "GET", undefined, signal),
      onValue: (value) => {
        setInspection(value);
        setLoadError("");
      },
      onError: (cause) => setLoadError(cause.message),
      interval: 1500,
    });
  }, [path, panel, active]);
  async function save(tools: string[], nextInstructions?: string) {
    setWorking(true);
    setError("");
    try {
      await api(`${path}/agent`, "PATCH", {
        tools,
        ...(nextInstructions === undefined
          ? {}
          : { instructions: nextInstructions }),
      });
      setInspection(await api(`${path}/inspect`));
      setInstructions(undefined);
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function toggleExtension(name: string, enabled: boolean) {
    setWorking(true);
    setError("");
    try {
      setInspection(
        await api(`${path}/extensions`, "PATCH", { name, enabled }),
      );
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const enabled =
    inspection?.tools.filter((item) => item.enabled).map((item) => item.name) ??
    [];
  return (
    <section
      className="space-y-4 p-4 text-sm"
      aria-label={`${panel} inspector`}
    >
      {(error || loadError) && (
        <p role="alert" className="text-xs text-destructive">
          {error || loadError}
        </p>
      )}
      {panel === "state" ? (
        <SharedState active={active} />
      ) : !inspection ? (
        <p className="text-muted-foreground">Loading runtime…</p>
      ) : (
        <>
          {panel === "tools" && (
            <>
              {!enabled.length && (
                <div className="space-y-2 border p-3">
                  <p className="text-xs">
                    This conversation has no tools selected. Choose installed
                    tools below, or enable the coordination tools.
                  </p>
                  <Button
                    size="sm"
                    disabled={!idle || working}
                    onClick={() =>
                      void save(
                        inspection.tools
                          .filter(
                            (tool) =>
                              tool.extension === "console.agent" &&
                              tool.permitted,
                          )
                          .map((tool) => tool.name),
                      )
                    }
                  >
                    Enable state & delegation
                  </Button>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-xs font-medium">
                  Tool selection · {enabled.length}/{inspection.tools.length}
                </summary>
                <p className="py-2 text-xs text-muted-foreground">
                  Enabled for this conversation. Tools execute directly on the
                  host.
                </p>
                {inspection.tools.map((tool) => (
                  <Collapsible key={tool.name} className="border">
                    <div className="flex items-center gap-2 p-3">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${tool.name}`}
                        checked={tool.enabled}
                        disabled={!idle || working || !tool.permitted}
                        onChange={(event) =>
                          void save(
                            event.target.checked
                              ? [...enabled, tool.name]
                              : enabled.filter((name) => name !== tool.name),
                          )
                        }
                      />
                      <CollapsibleTrigger className="flex flex-1 justify-between gap-2 text-left text-xs">
                        <span className="font-mono">{tool.name}</span>
                        <span className="text-muted-foreground">
                          {tool.replay === "safe"
                            ? "replay safe"
                            : "interrupt on crash"}
                        </span>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-2 border-t p-3 text-xs">
                      <p>{tool.description}</p>
                      <p className="text-muted-foreground">
                        {tool.extension}
                        {!tool.permitted &&
                          " · unavailable for this conversation"}
                      </p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(tool.parameters, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </details>
            </>
          )}
          {panel === "tasks" && (
            <>
              <h2 className="font-semibold">Conversation activity</h2>
              <p className="text-xs text-muted-foreground">
                {inspection.tasks.length
                  ? `${inspection.tasks.length} active runtime tasks`
                  : "No active model or tool calls."}
              </p>
              {inspection.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex justify-between gap-2 border p-3 text-xs"
                >
                  <span className="font-mono">
                    #{task.id} {task.name}
                  </span>
                  <span>{task.state}</span>
                </div>
              ))}
              {!!inspection.taskGraph?.length && (
                <details className="space-y-2 text-xs">
                  <summary>Related conversations and dependencies</summary>
                  <p className="py-2 text-muted-foreground">
                    All conversations sharing this runtime session. Scheduler:{" "}
                    {inspection.scheduling}.
                  </p>
                  {inspection.taskGraph.map((task) => (
                    <div key={task.id} className="mt-2 space-y-1 border p-2">
                      <p>
                        #{task.id} {task.name} · {task.state}
                      </p>
                      <p>
                        Conversation #{task.conversationId} ·{" "}
                        {task.owner
                          ? `owned by task #${task.owner}`
                          : "conversation-owned"}
                        {task.background ? " · background" : ""}
                        {task.abortRequested ? " · cancellation requested" : ""}
                      </p>
                      {!!task.waitingOn.length && (
                        <p>
                          Waiting on:{" "}
                          {task.waitingOn.map((id) => `#${id}`).join(", ")}
                        </p>
                      )}
                      {task.wakeAt && (
                        <p>Wake: {new Date(task.wakeAt).toLocaleString()}</p>
                      )}
                      {task.blockedReason && (
                        <p>Blocked: {task.blockedReason}</p>
                      )}
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          {panel === "extend" && (
            <>
              <details className="border-b pb-3">
                <summary className="cursor-pointer text-xs font-medium">
                  Installed extensions · {inspection.extensions.length}
                </summary>
                {inspection.extensions.map((extension) => {
                  return (
                    <div
                      key={extension.name}
                      className="space-y-2 border p-3 text-xs"
                    >
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Enable ${extension.name} extension`}
                          checked={extension.enabled}
                          disabled={!idle || working}
                          onChange={(event) =>
                            void toggleExtension(
                              extension.name,
                              event.target.checked,
                            )
                          }
                        />
                        <span className="font-mono">{extension.name}</span>
                      </label>
                      <p>
                        {extension.tools.length} tools · {extension.sections}{" "}
                        prompt sections · {extension.hooks} hooks
                      </p>
                      <p className="text-muted-foreground">
                        Applies to this conversation. Tools run on the host.
                      </p>
                    </div>
                  );
                })}
              </details>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save(enabled, instructions ?? inspection.instructions);
                }}
              >
                <label className="block space-y-2">
                  Agent instructions
                  <textarea
                    className="min-h-48 w-full border bg-background p-2 text-xs"
                    maxLength={16000}
                    value={instructions ?? inspection.instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    disabled={!idle || working}
                  />
                </label>
                <Button
                  disabled={!idle || working || instructions === undefined}
                >
                  Save instructions
                </Button>
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}

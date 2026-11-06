"use client";
import { ChevronRight } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import type { Execution } from "./conversation-state";
import { executionNeedsAttention } from "./execution-labels";
import { ExecutionStatus } from "./execution-status";
import { type ContextSettings, InspectorContext } from "./inspector-context";
import {
  type Guidance,
  InstructionEditor,
  RuntimeGuidance,
} from "./inspector-instructions";
import { type InspectorTool, InspectorTools } from "./inspector-tools";
import type { ChatModel, ModelRef } from "./use-chat-models";

type Change = {
  tools?: string[] | null;
  instructions?: string | null;
  projectInstructions?: string | null;
  workspaceGuidance?: string | null;
  inspectionGuidance?: string | null;
  automaticCompaction?: boolean;
  keepRecentTokens?: number;
};
type Configuration = {
  revision: string;
  tools: InspectorTool[];
  guidance?: Guidance;
  project?: { instructions: string };
  context?: ContextSettings;
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
  selectedModel,
  savedModel,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  working: boolean;
  execution?: Execution;
  selectedModel?: ChatModel;
  savedModel?: ModelRef;
}) {
  const [data, setData] = useState<Configuration>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const generation = useRef(0);
  const loaded = useRef(false);
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
  const savedProvider = savedModel?.provider;
  const savedModelId = savedModel?.modelId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh as soon as the stream reports a saved model change.
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
  }, [refresh, savedProvider, savedModelId]);
  async function mutate(action: () => Promise<void>) {
    if (savingRef.current) return false;
    generation.current += 1;
    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save changes.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function update(change: Change) {
    if (!data) return false;
    return mutate(async () => {
      const next = await request<Configuration>(`${path}/configuration`, {
        method: "PATCH",
        body: JSON.stringify({ revision: data.revision, ...change }),
      });
      setData(next);
    });
  }
  const compacting = !!execution?.compactions.length;
  const busy = working || compacting;
  const disabled = busy || saving;
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {(error || loadError) && (
        <p role="alert" className="pb-2 text-xs text-destructive">
          {error || loadError}
        </p>
      )}
      {!data && !loadError && <ConversationInspectorLoading />}
      {data && (
        <Tabs defaultValue="tools" className="min-h-0 flex-1 gap-3">
          <TabsList
            aria-label="Conversation settings"
            className="w-full shrink-0"
          >
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            {data.context && <TabsTrigger value="context">Context</TabsTrigger>}
          </TabsList>
          {executionNeedsAttention(execution) && (
            <Card size="sm" className="shrink-0">
              <CardHeader>
                <CardTitle>Execution</CardTitle>
              </CardHeader>
              <CardContent>
                <ExecutionStatus execution={execution} details />
              </CardContent>
            </Card>
          )}
          <TabsContent value="tools" keepMounted className="min-h-0">
            <ScrollArea className="h-full">
              <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
                <InspectorTools
                  tools={data.tools}
                  custom={data.toolSource === "conversation"}
                  working={busy}
                  saving={saving}
                  update={(tools) => void update({ tools })}
                />
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="instructions" keepMounted className="min-h-0">
            <ScrollArea className="h-full">
              <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
                <InstructionEditor
                  label="Conversation instructions"
                  scope="Applies to each reply in this conversation, starting with the next model request after you save."
                  placeholder="Add guidance for this conversation…"
                  value={data.instructions}
                  disabled={disabled}
                  save={(instructions) => update({ instructions })}
                />
                {data.project && (
                  <InstructionEditor
                    label="Shared project instructions"
                    scope="Saved in Console and applied to model requests across this project. Separate from AGENTS.md, which the agent can read with file tools."
                    placeholder="Add shared conventions or project goals…"
                    value={data.project.instructions}
                    disabled={saving}
                    save={(projectInstructions) =>
                      update({ projectInstructions })
                    }
                  />
                )}
                {(data.guidance || data.sections.length > 0) && (
                  <Collapsible className="group/guidance">
                    <CollapsibleTrigger
                      render={<Button variant="ghost" size="sm" />}
                      className="h-auto min-h-7 w-full justify-start whitespace-normal"
                    >
                      <ChevronRight
                        aria-hidden
                        data-icon="inline-start"
                        className="group-data-panel-open/guidance:rotate-90"
                      />
                      Built-in guidance and environment
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="flex min-w-0 flex-col gap-4">
                        {data.guidance?.inspection && (
                          <InstructionEditor
                            label="Project inspection rules"
                            scope="Tell the agent what to inspect and how to cite evidence in this project."
                            value={data.guidance.inspection.text}
                            customized={data.guidance.inspection.customized}
                            disabled={saving}
                            save={(inspectionGuidance) =>
                              update({ inspectionGuidance })
                            }
                          />
                        )}
                        {data.guidance && (
                          <InstructionEditor
                            label="Machine-wide evidence rules"
                            scope="Set how the agent verifies claims across all conversations on this machine."
                            value={data.guidance.workspace.text}
                            customized={data.guidance.workspace.customized}
                            disabled={saving}
                            save={(workspaceGuidance) =>
                              update({ workspaceGuidance })
                            }
                          />
                        )}
                        <RuntimeGuidance
                          guidance={data.guidance}
                          sections={data.sections}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          {data.context && (
            <TabsContent value="context" keepMounted className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex min-w-0 flex-col gap-4 px-1 py-2 pr-3">
                  <InspectorContext
                    settings={data.context}
                    selectedModel={selectedModel}
                    compacting={compacting}
                    disabled={disabled}
                    save={(keepRecentTokens) => update({ keepRecentTokens })}
                    setAutomatic={(automaticCompaction) =>
                      void update({ automaticCompaction })
                    }
                    compact={(focus) =>
                      mutate(async () => {
                        await request(`${path}/compact`, {
                          method: "POST",
                          body: JSON.stringify({ focus }),
                        });
                      })
                    }
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

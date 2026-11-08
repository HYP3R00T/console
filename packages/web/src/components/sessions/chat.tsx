"use client";
import { ArrowDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCommands } from "@/components/commands/command-registry";
import { ConversationCommands } from "@/components/commands/conversation-commands";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { useWorkspaceChrome } from "@/components/layout/workspace-chrome";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { executeBackendCommand } from "@/lib/backend/commands";
import { standaloneConversationPath } from "@/lib/conversation-path";
import { type ChatAttachment, wireAttachments } from "./attachments";
import { ChatComposer } from "./chat-composer";
import { ConversationTurn } from "./conversation-turn";
import { conversationTurns } from "./conversation-turns";
import { failureLabel } from "./execution-labels";
import { ExecutionStatus } from "./execution-status";
import { QueuedMessages } from "./queued-messages";
import {
  captureScrollAnchor,
  restoreScrollAnchor,
  type ScrollAnchor,
} from "./scroll-anchor";
import { type ModelRef, useChatModels } from "./use-chat-models";
import { useConversation } from "./use-conversation";
import { useInspectorSelection } from "./use-inspector-selection";
import type { Conversation } from "./use-project-sessions";
import { sessionsChanged } from "./use-project-sessions";
import { WorkspaceInspector } from "./workspace-inspector";

type Pending = {
  attachments?: ChatAttachment[];
  content: string;
  requestId: string;
  model?: ModelRef;
  thinkingLevel?: string;
  whenBusy?: "steer" | "followUp";
};
export function Chat({
  deviceId,
  sessionId,
  conversationId,
  title,
  subtitle,
  projectId,
  ancestry,
  branches,
}: {
  deviceId: string;
  sessionId: string;
  conversationId: string;
  title: string;
  subtitle: string;
  projectId?: string;
  ancestry?: { conversationId: number; at: number; name?: string };
  branches?: Conversation[];
}) {
  const route = usePathname();
  const commands = useCommands();
  const { setConversation, setInspector } = useWorkspaceChrome();
  useEffect(() => {
    setConversation({
      route,
      title,
      subtitle,
      sessionId,
      conversationId,
      projectId,
    });
    return () =>
      setConversation((current) =>
        current?.route === route ? undefined : current,
      );
  }, [
    route,
    title,
    subtitle,
    sessionId,
    conversationId,
    projectId,
    setConversation,
  ]);
  const state = useMachineProjects(deviceId);
  const path = `/v1/sessions/${sessionId}/conversations/${conversationId}`;
  const stream = useConversation(
    state.connected ? state.client : undefined,
    path,
  );
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [forking, setForking] = useState(false);
  const [createdFork, setCreatedFork] = useState<{
    id: number;
    name: string;
  }>();
  const forkRequest = useRef<{ entryId: number; creationId: string }>(
    undefined,
  );
  const projectSession = projectId
    ? `/devices/${deviceId}/projects/${projectId}/sessions/${sessionId}/conversations`
    : undefined;
  const conversationHref = (id: number | string) =>
    projectSession
      ? `${projectSession}/${id}`
      : standaloneConversationPath(
          `/devices/${deviceId}/conversations`,
          sessionId,
          id,
        );
  const related = branches?.filter(
    (branch) =>
      branch.id !== Number(conversationId) &&
      (branch.id === ancestry?.conversationId ||
        branch.parent?.conversationId === Number(conversationId) ||
        (ancestry &&
          branch.parent?.conversationId === ancestry.conversationId)),
  );
  const working = !!stream?.data?.busy || !!stream?.data?.queued;
  const execution = stream?.data?.execution;
  const modelSelection = useChatModels(
    state.request,
    pending?.model ?? stream?.data?.model,
    pending?.thinkingLevel ?? stream?.data?.thinkingLevel,
  );
  const selectedModel = modelSelection.model;
  const savedModel = stream?.data?.model;
  const inspectorSelection = useInspectorSelection(
    state.client?.backendId ?? state.origin,
    sessionId,
    conversationId,
    !!projectId,
  );
  useLayoutEffect(() => {
    const inspector = {
      route,
      title: "Workspace configuration",
      selectScope: inspectorSelection.selectScope,
      content: (
        <WorkspaceInspector
          key={`${state.client?.backendId ?? deviceId}:${path}`}
          deviceId={deviceId}
          sessionId={sessionId}
          conversationId={conversationId}
          projectId={projectId}
          selection={inspectorSelection.selection}
          onScopeChange={inspectorSelection.selectScope}
          onSectionChange={inspectorSelection.selectSection}
          storageError={inspectorSelection.storageError}
          path={path}
          request={state.request}
          working={working}
          execution={execution}
          selectedModel={selectedModel}
          savedModel={savedModel}
        />
      ),
    };
    setInspector(inspector);
    return () =>
      setInspector((current) => (current === inspector ? undefined : current));
  }, [
    route,
    deviceId,
    path,
    state.request,
    working,
    execution,
    selectedModel,
    savedModel,
    setInspector,
    state.client?.backendId,
    projectId,
    sessionId,
    conversationId,
    inspectorSelection.selection,
    inspectorSelection.selectScope,
    inspectorSelection.selectSection,
    inspectorSelection.storageError,
  ]);
  const [showLatest, setShowLatest] = useState(false);
  const [error, setError] = useState<string>();
  const [completion, setCompletion] = useState<{
    status: string;
    reason?: string;
  }>();
  const [completionError, setCompletionError] = useState<string>();
  useEffect(() => {
    setCompletion(undefined);
    setCompletionError(undefined);
    if (!stream?.data || stream.data.busy) return;
    const controller = new AbortController();
    void state
      .request<{ latest: { status: string; reason?: string } | null }>(
        `${path}/submissions`,
        { signal: controller.signal },
      )
      .then((data) => {
        if (!controller.signal.aborted) setCompletion(data.latest ?? undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCompletionError("Could not verify completion status.");
      });
    return () => controller.abort();
  }, [stream?.data, path, state.request]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const anchor = useRef<ScrollAnchor | undefined>(undefined);
  const follow = useRef(true);
  const scrollArea = useRef<HTMLDivElement>(null);
  const pendingKey = `console.pending:${state.origin}:${sessionId}:${conversationId}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(pendingKey);
      if (saved) {
        const value = JSON.parse(saved);
        if (
          typeof value.content === "string" &&
          typeof value.requestId === "string"
        )
          setPending(value);
      }
    } catch {
      setError("Pending message could not be restored.");
    }
  }, [pendingKey]);
  useLayoutEffect(() => {
    if (!stream?.data || !stream.sections) return;
    const area = scrollArea.current;
    if (!area) return;
    if (follow.current) area.scrollTop = area.scrollHeight;
    else if (anchor.current) restoreScrollAnchor(area, anchor.current);
  }, [stream?.data, stream?.sections]);
  const hasSnapshot = !!stream?.data;
  useEffect(() => {
    if (!hasSnapshot) return;
    const area = scrollArea.current;
    if (!area) return;
    const update = () => {
      if (follow.current) area.scrollTop = area.scrollHeight;
      setShowLatest(area.scrollHeight - area.scrollTop - area.clientHeight > 2);
    };
    const observer = new ResizeObserver(update);
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    update();
    return () => observer.disconnect();
  }, [hasSnapshot]);
  async function stop() {
    setStopping(true);
    setError(undefined);
    try {
      await executeBackendCommand(
        { request: state.request },
        "conversation.stop",
        { sessionId, conversationId },
        {},
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not stop conversation.",
      );
    } finally {
      setStopping(false);
    }
  }
  async function continueRun(failedTaskId: number) {
    setContinuing(true);
    setError(undefined);
    try {
      await executeBackendCommand(
        { request: state.request },
        "conversation.continue",
        { sessionId, conversationId },
        { failedTaskId },
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not continue the run.",
      );
    } finally {
      setContinuing(false);
    }
  }
  async function fork(entryId: number) {
    if (forking) return;
    const creationId =
      forkRequest.current?.entryId === entryId
        ? forkRequest.current.creationId
        : crypto.randomUUID();
    forkRequest.current = { entryId, creationId };
    setForking(true);
    setError(undefined);
    try {
      const created = await state.request<{ id: number; name: string }>(
        `${path}/fork`,
        {
          method: "POST",
          body: JSON.stringify({ at: entryId, creationId }),
        },
      );
      forkRequest.current = undefined;
      sessionsChanged();
      setCreatedFork(created);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not fork the conversation.",
      );
    } finally {
      setForking(false);
    }
  }
  async function send(whenBusy: "steer" | "followUp" = "followUp") {
    const message = pending ?? {
      content: content.trim(),
      attachments,
      requestId: crypto.randomUUID(),
      model: modelSelection.model
        ? {
            provider: modelSelection.model.provider,
            modelId: modelSelection.model.id,
          }
        : undefined,
      thinkingLevel: modelSelection.level,
      whenBusy,
      ...(working && stream?.data?.model
        ? {
            model: stream.data.model,
            thinkingLevel: stream.data.thinkingLevel,
          }
        : {}),
    };
    if (
      busy ||
      continuing ||
      stopping ||
      (!message.content && !message.attachments?.length) ||
      (!pending && !modelSelection.model)
    )
      return;
    setBusy(true);
    setError(undefined);
    // Keep the request identity when HTTP admission succeeded but its acknowledgement was lost.
    setPending(message);
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(message));
      const submitted = await state.request<{ id: number }>(
        `${path}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            ...message,
            attachments: wireAttachments(message.attachments ?? []),
          }),
        },
      );
      if (!Number.isSafeInteger(submitted.id))
        throw new Error("Invalid submission response.");
      setPending(undefined);
      setContent("");
      setAttachments([]);
      follow.current = true;
      sessionStorage.removeItem(pendingKey);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Message delivery is uncertain. Retry with the same request ID.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadEarlier(before: number) {
    if (!stream || loadingHistory) return;
    setLoadingHistory(true);
    setError(undefined);
    follow.current = false;
    captureAnchor();
    try {
      await stream.loadHistory(before);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load history.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }
  function captureAnchor() {
    const area = scrollArea.current;
    if (!area) return;
    anchor.current = captureScrollAnchor(area);
  }
  const sections = (stream?.sections ?? []).map((section) => ({
    ...section,
    turns: conversationTurns(section.messages),
  }));
  const lastTurn = sections.flatMap((section) => section.turns).at(-1)?.id;
  if (!stream?.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {stream?.status ?? "Loading conversation…"}
      </p>
    );
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ConversationCommands
        key={`${deviceId}:${path}`}
        request={state.request}
        sessionId={sessionId}
        conversationId={conversationId}
        working={working || !!execution?.compactions.length}
        pending={busy || stopping || continuing || !!pending}
        canContinue={
          !!execution?.failure?.canContinue && execution.state === "idle"
        }
        modelAvailable={!!savedModel}
        stop={stop}
        continueRun={() =>
          execution?.failure && continueRun(execution.failure.taskId)
        }
      />
      <h1 className="sr-only">{title}</h1>
      {stream.data.planMode && (
        <p className="text-xs text-muted-foreground">
          Plan mode · Read-only workspace tools
        </p>
      )}
      {ancestry && (
        <p className="text-xs text-muted-foreground">
          Forked from{" "}
          {ancestry.name ? (
            <Link
              className="underline underline-offset-2"
              href={conversationHref(ancestry.conversationId)}
            >
              {ancestry.name}
            </Link>
          ) : (
            "an unavailable conversation"
          )}
          {" · "}Entry {ancestry.at}
        </p>
      )}
      {!!related?.length && (
        <nav
          aria-label="Related conversation branches"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <span>Branches:</span>
          {related.map((branch) => (
            <Link
              key={branch.id}
              href={conversationHref(branch.id)}
              className="underline underline-offset-2"
            >
              {branch.name}
            </Link>
          ))}
        </nav>
      )}
      {stream?.status && stream.status !== "Live" && (
        <p role="status" className="text-xs text-muted-foreground">
          {stream.status}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <ScrollArea
          viewportRef={scrollArea}
          viewportClassName="[overflow-anchor:none]"
          className="h-full min-h-0"
          onViewportScroll={(event) => {
            const area = event.currentTarget;
            const distance =
              area.scrollHeight - area.scrollTop - area.clientHeight;
            follow.current = distance <= 2;
            if (!follow.current) captureAnchor();
            setShowLatest(distance > 2);
          }}
        >
          <div className="mx-auto min-w-0 max-w-3xl pr-3">
            {sections.flatMap((section, sectionIndex) => [
              section.gap && (
                <div key={`gap:${section.gap.before}`} className="py-2">
                  <Button
                    variant="ghost"
                    disabled={loadingHistory}
                    onClick={() => {
                      if (section.gap) void loadEarlier(section.gap.before);
                    }}
                  >
                    {loadingHistory
                      ? "Loading history…"
                      : section.gap.earlier
                        ? "Load earlier"
                        : "Load missing messages"}
                  </Button>
                </div>
              ),
              ...section.turns.map((turn) => (
                <ConversationTurn
                  key={turn.id}
                  turn={turn}
                  working={
                    sectionIndex === sections.length - 1 &&
                    turn.id === lastTurn &&
                    !!stream.data?.busy
                  }
                  partial={
                    turn.id === lastTurn ? stream.data?.partial : undefined
                  }
                  activeTools={
                    turn.id === lastTurn ? (stream.data?.activeTools ?? []) : []
                  }
                  liveTools={execution?.tools}
                  path={path}
                  request={state.request}
                  fork={(entryId) => void fork(entryId)}
                  forkDisabled={forking}
                />
              )),
            ])}
            {!lastTurn && !stream?.data?.busy && (
              <p className="px-3 py-12 text-sm text-muted-foreground">
                Send the first message.
              </p>
            )}
          </div>
        </ScrollArea>
        {showLatest && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <ControlTooltip label="Jump to latest">
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto rounded-full px-3 shadow-sm"
                aria-label="Jump to latest"
                onClick={() => {
                  follow.current = true;
                  if (scrollArea.current)
                    scrollArea.current.scrollTop =
                      scrollArea.current.scrollHeight;
                  setShowLatest(false);
                }}
              >
                <ArrowDown className="size-3.5" />
                Latest
              </Button>
            </ControlTooltip>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {createdFork && (
        <p role="status" className="text-xs text-muted-foreground">
          Fork created.{" "}
          <Link
            className="underline underline-offset-2"
            href={conversationHref(createdFork.id)}
          >
            Open {createdFork.name}
          </Link>
        </p>
      )}
      <ExecutionStatus execution={execution} />
      {execution?.state === "idle" && execution.failure?.canContinue && (
        <Button
          className="self-start"
          variant="outline"
          size="sm"
          disabled={busy || stopping || continuing || !!pending}
          onClick={() => {
            try {
              void commands.invoke("conversation.continue");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Continue unavailable.",
              );
            }
          }}
        >
          {continuing ? "Continuing…" : "Continue run"}
        </Button>
      )}
      {!execution?.failure && completion?.status === "unanswered" && (
        <p role="status" className="text-sm text-destructive">
          {failureLabel(completion.reason ?? "failed")}
        </p>
      )}
      {completionError && (
        <p role="alert" className="text-sm text-destructive">
          {completionError}
        </p>
      )}
      {pending && (
        <p role="status" className="text-xs text-muted-foreground">
          Delivery pending. Retry sends the same message once.
        </p>
      )}
      <QueuedMessages
        items={stream?.data?.queue ?? []}
        path={path}
        request={state.request}
      />
      <ChatComposer
        attachments={pending?.attachments ?? attachments}
        onAttachmentsChange={setAttachments}
        content={pending?.content ?? content}
        onChange={setContent}
        onSend={(mode) => void send(mode)}
        onStop={() => {
          try {
            void commands.invoke("conversation.stop");
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Stop unavailable.",
            );
          }
        }}
        stopping={stopping}
        sending={busy || stopping}
        pending={!!pending}
        working={working}
        imageSupported={
          working
            ? modelSelection.models
                .find(
                  (model) =>
                    model.provider === stream?.data?.model?.provider &&
                    model.id === stream.data.model.modelId,
                )
                ?.input?.includes("image")
            : undefined
        }
        models={modelSelection}
      />
    </div>
  );
}

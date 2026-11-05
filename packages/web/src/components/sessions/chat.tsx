"use client";
import { ArrowDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { useWorkspaceChrome } from "@/components/layout/workspace-chrome";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityInspector } from "./activity-inspector";
import { MessageAttachments } from "./attachment-list";
import { type ChatAttachment, wireAttachments } from "./attachments";
import { ChatComposer } from "./chat-composer";
import { QueuedMessages } from "./queued-messages";
import { ToolActivity } from "./tool-activity";
import { type ModelRef, useChatModels } from "./use-chat-models";
import { type ChatMessage, useConversation } from "./use-conversation";

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
}: {
  deviceId: string;
  sessionId: string;
  conversationId: string;
  title: string;
  subtitle: string;
}) {
  const route = usePathname();
  const { setConversation, inspectorHost } = useWorkspaceChrome();
  useEffect(() => {
    setConversation({ route, title, subtitle });
    return () =>
      setConversation((current) =>
        current?.route === route ? undefined : current,
      );
  }, [route, title, subtitle, setConversation]);
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
  const working = !!stream?.data?.busy || !!stream?.data?.queued;
  const modelSelection = useChatModels(
    state.request,
    pending?.model ?? stream?.data?.model,
    pending?.thinkingLevel ?? stream?.data?.thinkingLevel,
  );
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
  const [earlier, setEarlier] = useState<ChatMessage[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string>();
  const [historyStarted, setHistoryStarted] = useState(false);
  const [historyDone, setHistoryDone] = useState(false);
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
  useEffect(() => {
    if (stream?.data && follow.current && scrollArea.current)
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [stream?.data]);
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
      await state.request(`${path}/stop`, { method: "POST", body: "{}" });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not stop conversation.",
      );
    } finally {
      setStopping(false);
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
  async function loadEarlier() {
    setBusy(true);
    setError(undefined);
    const area = scrollArea.current;
    const previousHeight = area?.scrollHeight ?? 0;
    try {
      const page = await state.request<{
        messages: ChatMessage[];
        next?: string;
      }>(
        `${path}/history${historyCursor ? `?cursor=${encodeURIComponent(historyCursor)}` : ""}`,
      );
      setEarlier((previous) => [...page.messages, ...previous]);
      setHistoryCursor(page.next);
      setHistoryStarted(true);
      setHistoryDone(!page.next);
      follow.current = false;
      requestAnimationFrame(() => {
        if (area) area.scrollTop += area.scrollHeight - previousHeight;
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load history.",
      );
    } finally {
      setBusy(false);
    }
  }
  const messages = [
    ...new Map(
      [...earlier, ...(stream?.data?.messages ?? [])].map((message) => [
        message.id,
        message,
      ]),
    ).values(),
  ].sort((a, b) => a.entryId - b.entryId);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <h1 className="sr-only">{title}</h1>
      {inspectorHost &&
        createPortal(
          <ActivityInspector
            title={title}
            subtitle={subtitle}
            messages={messages}
            data={stream?.data}
            status={stream?.status}
            hasEarlier={
              !historyDone && !!(stream?.data?.hasEarlier || historyStarted)
            }
          />,
          inspectorHost,
        )}
      {stream?.status && stream.status !== "Live" && (
        <p role="status" className="text-xs text-muted-foreground">
          {stream.status}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <ScrollArea
          viewportRef={scrollArea}
          className="h-full min-h-0"
          onViewportScroll={(event) => {
            const area = event.currentTarget;
            const distance =
              area.scrollHeight - area.scrollTop - area.clientHeight;
            follow.current = distance <= 2;
            setShowLatest(distance > 2);
          }}
        >
          <div className="min-w-0 pr-3">
            {!historyDone && (stream?.data?.hasEarlier || historyStarted) && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void loadEarlier()}
              >
                Load earlier
              </Button>
            )}
            {messages.map((message) => (
              <article key={message.id} className="space-y-2 px-3 py-5">
                <p className="text-xs font-medium text-muted-foreground">
                  {message.role === "user"
                    ? "You"
                    : message.role === "tool"
                      ? `${message.toolName} · ${message.failed ? "Failed" : "Completed"}`
                      : "Assistant"}
                </p>
                {!!message.attachments?.length && (
                  <MessageAttachments
                    files={message.attachments}
                    path={path}
                    entryId={message.entryId}
                    request={state.request}
                  />
                )}
                {message.role === "tool" ? (
                  <ToolActivity
                    label={message.failed ? "View error" : "View result"}
                    content={message.text}
                    failed={message.failed}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {message.text ||
                      (message.failed ? "Response interrupted or failed." : "")}
                  </p>
                )}
                {message.toolCalls?.map((call) => (
                  <ToolActivity
                    key={call.id}
                    label={call.name}
                    content={call.arguments}
                  />
                ))}
                {message.role !== "tool" && message.failed && message.text && (
                  <p className="text-xs text-destructive">
                    Response interrupted or failed.
                  </p>
                )}
              </article>
            ))}
            {!!stream?.data?.activeTools?.length && (
              <p
                role="status"
                className="px-3 py-2 text-xs text-muted-foreground"
              >
                Inspecting project ·{" "}
                {stream.data.activeTools.map((tool) => tool.name).join(", ")}
              </p>
            )}
            {stream?.data?.partial && (
              <article className="space-y-2 px-3 py-5">
                <p className="text-xs text-muted-foreground">
                  Assistant · Working
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                  {stream.data.partial}
                </p>
              </article>
            )}
            {!messages.length && !stream?.data?.busy && (
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
      {completion?.status === "unanswered" && (
        <p role="status" className="text-sm text-destructive">
          Last input was not answered ({completion.reason ?? "failed"}).
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
        onStop={() => void stop()}
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

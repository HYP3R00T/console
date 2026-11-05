"use client";
import { ArrowDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceChrome } from "@/components/layout/workspace-chrome";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityInspector } from "./activity-inspector";
import { ChatComposer } from "./chat-composer";
import { ToolActivity } from "./tool-activity";
import { type ModelRef, useChatModels } from "./use-chat-models";
import { type ChatMessage, useConversation } from "./use-conversation";

type Pending = {
  content: string;
  requestId: string;
  model?: ModelRef;
  thinkingLevel?: string;
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
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
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
  const bottom = useRef<HTMLDivElement>(null);
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
    if (stream?.data && follow.current)
      bottom.current?.scrollIntoView({ block: "end" });
  }, [stream?.data]);
  const hasSnapshot = !!stream?.data;
  useEffect(() => {
    if (!hasSnapshot) return;
    const area = scrollArea.current;
    if (!area) return;
    const update = () =>
      setShowLatest(
        area.scrollHeight - area.scrollTop - area.clientHeight > 64,
      );
    const observer = new ResizeObserver(update);
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    update();
    return () => observer.disconnect();
  }, [hasSnapshot]);
  async function send() {
    const message = pending ?? {
      content: content.trim(),
      requestId: crypto.randomUUID(),
      model: modelSelection.model
        ? {
            provider: modelSelection.model.provider,
            modelId: modelSelection.model.id,
          }
        : undefined,
      thinkingLevel: modelSelection.level,
    };
    if (busy || !message.content || (!pending && !modelSelection.model)) return;
    setBusy(true);
    setError(undefined);
    // Keep the request identity when HTTP admission succeeded but its acknowledgement was lost.
    setPending(message);
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(message));
      const submitted = await state.request<{ id: number }>(
        `${path}/messages`,
        { method: "POST", body: JSON.stringify(message) },
      );
      if (!Number.isSafeInteger(submitted.id))
        throw new Error("Invalid submission response.");
      setPending(undefined);
      setContent("");
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
      <ScrollArea
        viewportRef={scrollArea}
        className="min-h-0 flex-1"
        onViewportScroll={(event) => {
          const area = event.currentTarget;
          const distance =
            area.scrollHeight - area.scrollTop - area.clientHeight;
          follow.current = distance < 64;
          setShowLatest(distance > 64);
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
          <div ref={bottom} />
        </div>
      </ScrollArea>
      {showLatest && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Jump to latest"
            title="Jump to latest"
            onClick={() => {
              follow.current = true;
              bottom.current?.scrollIntoView({ block: "end" });
              setShowLatest(false);
            }}
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      )}
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
      <ChatComposer
        content={pending?.content ?? content}
        onChange={setContent}
        onSend={() => void send()}
        sending={busy}
        pending={!!pending}
        working={!!stream?.data?.busy || !!stream?.data?.queued}
        models={modelSelection}
      />
    </div>
  );
}

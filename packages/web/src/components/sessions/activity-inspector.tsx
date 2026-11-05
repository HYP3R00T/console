"use client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolActivity } from "./tool-activity";
import type { ChatMessage, ChatSnapshot } from "./use-conversation";

/** A second projection of the existing conversation snapshot, never another subscription. */
export function ActivityInspector({
  title,
  subtitle,
  messages,
  data,
  status,
  hasEarlier,
}: {
  title: string;
  subtitle: string;
  messages: ChatMessage[];
  data?: ChatSnapshot;
  status?: string;
  hasEarlier: boolean;
}) {
  const activity = messages.filter(
    (message) => message.role === "tool" || message.toolCalls?.length,
  );
  return (
    <div className="flex h-full min-h-0 w-[300px] max-w-full flex-col">
      <header className="space-y-1 px-4 py-4 pr-12">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="truncate text-sm" title={title}>
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={subtitle}>
          {subtitle}
        </p>
        <p role="status" className="pt-2 text-xs text-muted-foreground">
          {status && status !== "Live"
            ? status
            : !data
              ? "Connecting…"
              : data.busy
                ? "Working"
                : "Idle"}
          {!!data?.queued && ` · ${data.queued} queued`}
        </p>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 pb-4">
          {!!data?.activeTools?.length && (
            <section
              aria-label="Active tools"
              className="space-y-2 rounded-lg bg-muted/30 p-3"
            >
              <h3 className="text-xs font-medium">Running now</h3>
              {[...new Set(data.activeTools.map((tool) => tool.name))].map(
                (name) => (
                  <p key={name} className="break-words text-xs">
                    {name}
                  </p>
                ),
              )}
            </section>
          )}
          {hasEarlier && (
            <p className="text-xs text-muted-foreground">
              Earlier activity may be available. Use Load earlier in the
              conversation.
            </p>
          )}
          {activity.map((message) => (
            <section
              key={message.id}
              aria-label={
                message.role === "tool"
                  ? `${message.toolName} result`
                  : "Tool calls"
              }
              className="space-y-2 rounded-lg bg-muted/20 p-3"
            >
              {message.toolCalls?.map((call) => (
                <ToolActivity
                  key={call.id}
                  label={`${call.name} · Arguments`}
                  content={call.arguments}
                />
              ))}
              {message.role === "tool" && (
                <>
                  <p
                    className={`text-xs font-medium ${message.failed ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {message.toolName} ·{" "}
                    {message.failed ? "Failed" : "Completed"}
                  </p>
                  <ToolActivity
                    label={message.failed ? "View error" : "View result"}
                    content={message.text}
                    failed={message.failed}
                  />
                </>
              )}
            </section>
          ))}
          {!activity.length && !data?.activeTools?.length && (
            <p className="text-xs text-muted-foreground">
              {data
                ? "No tool activity in the loaded conversation."
                : "Waiting for conversation activity."}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

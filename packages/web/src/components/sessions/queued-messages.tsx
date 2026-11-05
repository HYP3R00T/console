"use client";

import { CornerUpLeft, Pencil, X } from "lucide-react";
import { useState } from "react";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import type { QueuedInput } from "./use-conversation";

export function QueuedMessages({
  items,
  path,
  request,
}: {
  items: QueuedInput[];
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const [editing, setEditing] = useState<QueuedInput>();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function change(
    item: QueuedInput,
    action: "withdraw" | "steer" | "edit",
  ) {
    setBusy(true);
    setError(undefined);
    try {
      await request(`${path}/queue/${item.id}`, {
        method: action === "withdraw" ? "DELETE" : "PATCH",
        ...(action !== "withdraw"
          ? {
              body: JSON.stringify({
                content: action === "edit" ? content : item.content,
                whenBusy: action === "steer" ? "steer" : item.whenBusy,
                expectedContent: item.content,
                expectedWhenBusy: item.whenBusy,
              }),
            }
          : {}),
      });
      if (editing?.id === item.id) setEditing(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update queued input.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!items.length && !editing && !error) return null;
  return (
    <section
      aria-label="Queued messages"
      className="mx-auto w-full max-w-3xl space-y-2 text-xs"
    >
      <p className="text-muted-foreground">Queued · {items.length}</p>
      <ScrollArea className="max-h-40" viewportClassName="max-h-40">
        <div className="space-y-1 pr-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5"
            >
              <span className="shrink-0 text-muted-foreground">
                {item.whenBusy === "steer" ? "Steer" : "Next"}
              </span>
              <p className="min-w-0 flex-1 truncate">
                {item.content ||
                  item.attachments.map((file) => file.name).join(", ")}
              </p>
              <ControlTooltip label="Edit queued message">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Edit queued message ${item.id}`}
                  disabled={busy}
                  onClick={() => {
                    setEditing(item);
                    setContent(item.content);
                    setError(undefined);
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
              </ControlTooltip>
              {item.whenBusy !== "steer" && (
                <ControlTooltip label="Use as steer at the next safe boundary">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Steer queued message ${item.id}`}
                    disabled={busy}
                    onClick={() => void change(item, "steer")}
                  >
                    <CornerUpLeft className="size-3" />
                  </Button>
                </ControlTooltip>
              )}
              <ControlTooltip label="Withdraw queued message">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Withdraw queued message ${item.id}`}
                  disabled={busy}
                  onClick={() => void change(item, "withdraw")}
                >
                  <X className="size-3" />
                </Button>
              </ControlTooltip>
            </div>
          ))}
        </div>
      </ScrollArea>
      {editing && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <Textarea
            aria-label="Edit queued message"
            value={content}
            maxLength={32000}
            disabled={busy}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                busy || (!content.trim() && !editing.attachments.length)
              }
              onClick={() => void change(editing, "edit")}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

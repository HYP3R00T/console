"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatMessage } from "./conversation-state";
export function ForkConversationDialog({
  open,
  onOpenChange,
  messages,
  busy,
  fork,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  busy: boolean;
  fork: (entryId: number) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const candidates = [
    ...new Map(
      messages
        .filter(
          (message) =>
            message.role !== "tool" &&
            (message.text || message.attachments?.length),
        )
        .map((message) => [message.entryId, message]),
    ).values(),
  ];
  const current = candidates.find(
    (message) => String(message.entryId) === selected,
  );
  function changeOpen(next: boolean) {
    if (busy) return;
    if (!next) {
      setSelected(undefined);
      setError(undefined);
    }
    onOpenChange(next);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fork conversation</DialogTitle>
          <DialogDescription>
            Start a conversation at an explicit message. It remains in this
            session and does not create an isolated checkout.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fork-point">Message to fork from</FieldLabel>
            <Select
              value={selected ?? ""}
              disabled={busy}
              onValueChange={(value) => {
                if (value) {
                  setSelected(value);
                  setError(undefined);
                }
              }}
            >
              <SelectTrigger id="fork-point" className="w-full">
                <SelectValue>
                  {current
                    ? `${current.role} · message ${current.entryId}`
                    : "Choose a loaded message"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {candidates.map((message) => (
                    <SelectItem
                      key={message.entryId}
                      value={String(message.entryId)}
                    >
                      {message.role} ·{" "}
                      {message.text.slice(0, 100) || "Attachment"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        {current && (
          <ScrollArea className="max-h-48" viewportClassName="max-h-48">
            <p className="whitespace-pre-wrap text-sm text-foreground/75">
              {current.text || "Message contains an attachment."}
            </p>
          </ScrollArea>
        )}
        <p className="text-xs text-foreground/60">
          Only loaded messages are listed. Load earlier transcript history to
          select an older point.
        </p>
        <div className="flex gap-2">
          <Button
            disabled={busy || !current}
            onClick={async () => {
              if (current) {
                if (await fork(current.entryId)) {
                  setSelected(undefined);
                  onOpenChange(false);
                } else
                  setError(
                    "Could not create the fork. Your selected message is retained; retry when ready.",
                  );
              }
            }}
          >
            {busy ? "Forking…" : "Fork conversation"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

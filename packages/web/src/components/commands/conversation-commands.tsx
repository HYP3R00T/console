"use client";
import { useEffect, useRef, useState } from "react";
import { useBackendCommands } from "@/components/commands/backend-commands";
import { useRegisterCommands } from "@/components/commands/command-registry";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { BackendClient } from "@/lib/backend/client";
import { executeBackendCommand } from "@/lib/backend/commands";
export function ConversationCommands({
  request,
  sessionId,
  conversationId,
  working,
  pending,
  canContinue,
  modelAvailable,
  stop,
  continueRun,
}: {
  request: BackendClient["request"];
  sessionId: string;
  conversationId: string;
  working: boolean;
  pending: boolean;
  canContinue: boolean;
  modelAvailable: boolean;
  stop: () => unknown;
  continueRun: () => unknown;
}) {
  const [open, setOpen] = useState(false),
    [focus, setFocus] = useState("");
  const [error, setError] = useState<string>(),
    [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const discovery = useBackendCommands();
  const unsupported =
    discovery.status === "ready" && !discovery.supports("conversation.compact");
  async function compact(input: { focus?: string }) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await executeBackendCommand(
        { request },
        "conversation.compact",
        { sessionId, conversationId },
        input,
      );
      if (active.current) {
        setOpen(false);
        setFocus("");
      }
      return true;
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : "Compaction failed.");
      throw error;
    } finally {
      inFlight.current = false;
      if (active.current) setSaving(false);
    }
  }
  useRegisterCommands({
    "conversation.stop": {
      disabled: !working
        ? "This conversation has no active or queued work."
        : pending
          ? "A command is pending."
          : undefined,
      run: stop,
    },
    "conversation.continue": {
      disabled:
        working || pending || !canContinue
          ? "No eligible idle run is available to continue."
          : undefined,
      run: continueRun,
    },
    "conversation.compact": {
      disabled: unsupported
        ? "Compaction is not advertised by this backend."
        : working || pending || saving || !modelAvailable
          ? "Compaction requires an idle conversation with a saved model."
          : undefined,
      run: (input) =>
        input === undefined
          ? setOpen(true)
          : compact(input as { focus?: string }),
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) setOpen(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compact conversation context</DialogTitle>
          <DialogDescription>
            Summarize older messages in this conversation. The transcript
            remains available.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void compact({ focus }).catch(() => {});
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="compact-focus">
                What should the summary preserve? (optional)
              </FieldLabel>
              <Textarea
                id="compact-focus"
                maxLength={2000}
                value={focus}
                disabled={saving}
                onChange={(event) => setFocus(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button className="mt-4" type="submit" disabled={saving || working}>
            {saving ? "Requesting…" : "Compact now"}
          </Button>
        </form>
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

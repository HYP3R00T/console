"use client";

import { PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/lib/console-api";

export function NewSessionDialog({
  open,
  working,
  error,
  onClose,
  onCreate,
  workspaces,
  defaultWorkspace,
}: {
  open: boolean;
  working: boolean;
  error: string;
  onClose: () => void;
  workspaces: Workspace[];
  defaultWorkspace: string;
  onCreate: (
    name: string,
    requestId: string,
    workspaceId?: string,
    access?: string,
  ) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [access, setAccess] = useState("none");
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspace);
  useEffect(() => {
    if (defaultWorkspace) setWorkspaceId(defaultWorkspace);
  }, [defaultWorkspace]);
  const [attempt, setAttempt] = useState<{
    name: string;
    requestId: string;
    workspaceId?: string;
    access?: string;
  }>();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="new-session-title"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-none border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <form
        className="space-y-5 p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (working) return;
          const input = attempt ?? {
            name: "",
            requestId: crypto.randomUUID(),
            workspaceId: workspaceId || undefined,
            access,
          };
          setAttempt(input);
          if (
            await onCreate(
              input.name,
              input.requestId,
              input.workspaceId,
              input.access,
            )
          ) {
            setAttempt(undefined);
          }
        }}
      >
        <header className="flex items-center justify-between gap-4">
          <h2
            id="new-session-title"
            className="text-lg font-semibold tracking-tight"
          >
            New session
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close new session"
            onClick={onClose}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </header>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A numbered session on this machine. Rename it in the network tree.
          Start with Main, then add conversations with their own model and
          permissions.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-2 text-sm">
          <span>Project on this machine</span>
          <ChoiceSelect
            label="Project"
            value={workspaceId || "none"}
            items={[
              { value: "none", label: "No project (conversation only)" },
              ...workspaces.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
            disabled={working || Boolean(attempt)}
            onChange={(value) => setWorkspaceId(value === "none" ? "" : value)}
          />
          <Link
            href="/workspaces"
            className="block text-xs underline"
            onClick={onClose}
          >
            Add or create a project
          </Link>
        </div>
        {workspaceId && (
          <div className="space-y-2 text-sm">
            <span>Agent access</span>
            <ChoiceSelect
              label="Agent access"
              value={access}
              disabled={working || Boolean(attempt)}
              items={[
                { value: "none", label: "Conversation only — tools disabled" },
                { value: "read", label: "Read project files" },
                { value: "edit", label: "Read and edit project files" },
                {
                  value: "setup",
                  label: "Setup: edit files, run commands, access network",
                },
              ]}
              onChange={setAccess}
            />
          </div>
        )}
        {attempt && !working && (
          <p className="text-xs text-muted-foreground">
            Retrying uses the same request to avoid creating a duplicate.
          </p>
        )}
        <Button className="w-full" type="submit" disabled={working}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          {working
            ? "Creating…"
            : attempt
              ? "Retry creation"
              : "Create session"}
        </Button>
      </form>
    </dialog>
  );
}

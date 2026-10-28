"use client";

import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, type SessionSummary } from "@/lib/console-api";

export function SessionSidebar({
  sessions,
  selected,
  onSelect,
  onCreate,
  working,
}: {
  sessions: SessionSummary[];
  selected: string;
  working: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string, requestId: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [attempt, setAttempt] = useState<{ name: string; requestId: string }>();
  return (
    <aside
      className="flex flex-col border-b bg-muted/20 lg:min-h-0 lg:border-r lg:border-b-0"
      aria-label="Sessions"
    >
      <div className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          This machine
        </p>
        <h2 className="mt-1 font-semibold">Sessions</h2>
      </div>
      <form
        className="space-y-2 border-b p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const input = attempt ?? {
            name: name.trim(),
            requestId: crypto.randomUUID(),
          };
          setAttempt(input);
          if (await onCreate(input.name, input.requestId)) {
            setName("");
            setAttempt(undefined);
          }
        }}
      >
        <label className="sr-only" htmlFor="session-name">
          Session name
        </label>
        <input
          id="session-name"
          className={fieldClass}
          placeholder="Name a new session"
          maxLength={80}
          value={name}
          disabled={working || Boolean(attempt)}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          className="w-full"
          variant="outline"
          type="submit"
          disabled={working || !name.trim()}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          {attempt ? "Retry creation" : "Create session"}
        </Button>
      </form>
      <nav
        className="max-h-60 space-y-1 overflow-y-auto p-2 lg:max-h-none lg:flex-1"
        aria-label="Session navigation"
      >
        {!sessions.length && (
          <p className="p-3 text-sm text-muted-foreground">
            Create a session to get started.
          </p>
        )}
        {sessions.map((session) => (
          <button
            type="button"
            key={session.id}
            aria-current={session.id === selected ? "page" : undefined}
            onClick={() => onSelect(session.id)}
            className={`flex w-full gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent ${session.id === selected ? "border-border bg-accent" : "border-transparent"}`}
          >
            <MessageSquareIcon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {session.name}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Main · {session.status}
              </span>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

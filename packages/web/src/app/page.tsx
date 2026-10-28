"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBackend } from "@/components/console-shell";
import {
  api,
  type Machine,
  type SessionSummary,
  type Workspace,
} from "@/lib/console-api";

export default function Home() {
  const { connections } = useBackend();
  const [summary, setSummary] = useState<{
    machine: Machine;
    projects: Workspace[];
    sessions: SessionSummary[];
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [machines, projects, sessions] = await Promise.all([
          api<Machine[]>("/machines", "GET", undefined, controller.signal),
          api<Workspace[]>("/workspaces", "GET", undefined, controller.signal),
          api<SessionSummary[]>(
            "/sessions",
            "GET",
            undefined,
            controller.signal,
          ),
        ]);
        if (!controller.signal.aborted) {
          setSummary({ machine: machines[0], projects, sessions });
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("Machine unavailable. Summary may be stale.");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-5 sm:p-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Overview
        </p>
        <h1 className="text-3xl font-semibold">Console</h1>
        <p className="text-sm text-muted-foreground">
          Your machines, projects, and ongoing work.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Machines", connections.length, "/machines"],
          ["Projects", summary?.projects.length ?? "—", "/workspaces"],
          ["Sessions", summary?.sessions.length ?? "—", "/chat"],
          ["Unfinished", summary?.machine.activeSessions ?? "—", "/chat"],
        ].map(([label, value, href]) => (
          <Link
            key={label}
            href={String(href)}
            className="border p-5 hover:bg-accent"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl tabular-nums">{value}</p>
          </Link>
        ))}
      </section>
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-medium">Machines</h2>
          <Link href="/machines" className="text-xs underline">
            Add or configure machine
          </Link>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {connections.map((machine) => (
            <Link
              href="/machines"
              key={machine.id}
              className="border p-4 hover:bg-accent"
            >
              <p className="text-sm font-medium">{machine.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {machine.local ? "Local" : "Remote"} · {machine.status}
              </p>
            </Link>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-medium">
            Recent sessions · {summary?.machine.name || "selected machine"}
          </h2>
          <Link href="/chat" className="text-xs underline">
            Open conversations
          </Link>
        </header>
        {summary?.sessions
          .slice(-6)
          .reverse()
          .map((session) => (
            <Link
              href={`/chat?session=${session.id}`}
              key={session.id}
              className="flex items-center justify-between border p-4 hover:bg-accent"
            >
              <span className="text-sm">{session.name}</span>
              <span className="text-xs text-muted-foreground">
                {session.status}
              </span>
            </Link>
          ))}
        {summary && !summary.sessions.length && (
          <p className="text-sm text-muted-foreground">
            No sessions yet. Add a project or start a conversation.
          </p>
        )}
      </section>
    </main>
  );
}

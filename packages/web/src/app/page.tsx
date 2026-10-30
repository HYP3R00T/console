"use client";

import { LoaderCircleIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBackend } from "@/components/machines/connection-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  api,
  type Machine,
  type SessionSummary,
  type Workspace,
} from "@/lib/api";

export default function Home() {
  const { connections, id, select } = useBackend();
  const [disconnecting, setDisconnecting] = useState("");
  const [actionError, setActionError] = useState("");
  async function disconnect(machineId: string) {
    setDisconnecting(machineId);
    setActionError("");
    try {
      await api(`/backends/${machineId}`, "DELETE");
      if (id === machineId) select("");
      window.dispatchEvent(new Event("console:backends-changed"));
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setDisconnecting("");
    }
  }
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
          ["Active projects", summary?.sessions.length ?? "—", "/chat"],
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
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {connections.map((machine) => (
            <Card
              key={machine.id}
              size="sm"
              className="relative hover:bg-accent"
            >
              <Link
                href={`/chat?backend=${encodeURIComponent(machine.id)}`}
                onClick={() => select(machine.id)}
                aria-label={`Open ${machine.name}`}
                className="absolute inset-0 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring"
              />
              <CardContent className="pointer-events-none pr-12">
                <h3 className="text-sm font-medium">{machine.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {machine.local ? "Local" : "Remote"} · {machine.status}
                </p>
              </CardContent>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1/2 right-3 z-10 size-6 -translate-y-1/2 text-destructive"
                disabled={!!disconnecting}
                aria-label={`Disconnect ${machine.name}`}
                aria-busy={disconnecting === machine.id}
                title="Disconnect without stopping work or deleting machine data"
                onClick={() => void disconnect(machine.id)}
              >
                {disconnecting === machine.id ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <TrashIcon className="size-3.5" />
                )}
              </Button>
            </Card>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-medium">
            Recent project activity ·{" "}
            {summary?.machine.name || "selected machine"}
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
            No project activity yet. Add a project or start a conversation.
          </p>
        )}
      </section>
    </main>
  );
}

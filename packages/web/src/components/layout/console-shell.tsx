"use client";

import {
  ArrowLeftIcon,
  MonitorIcon,
  SettingsIcon,
  TerminalSquareIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { ChatWorkspace } from "@/components/chat/workspace";
import { BackendContext } from "@/components/machines/connection-context";
import { api, type BackendConnection } from "@/lib/api";
import {
  rememberWorkspaceLocation,
  workspaceLocation,
} from "@/lib/workspace-location";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [id, setId] = useState("");
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connections, setConnections] = useState<BackendConnection[]>([]);
  const pathname = usePathname();
  const management = !["/", "/chat"].includes(pathname);
  useEffect(() => {
    if (!management) rememberWorkspaceLocation();
  }, [management]);
  function select(next: string) {
    sessionStorage.setItem("console.backend", next);
    const url = new URL(window.location.href);
    for (const key of ["session", "conversation", "workspace", "new"])
      url.searchParams.delete(key);
    url.searchParams.set("backend", next);
    window.history.replaceState(null, "", url.pathname + url.search);
    rememberWorkspaceLocation(`/chat?backend=${encodeURIComponent(next)}`);
    setId(next);
  }
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let revision = 0;
    async function refresh() {
      clearTimeout(timer);
      const started = ++revision;
      try {
        const rows = await api<BackendConnection[]>(
          "/backends",
          "GET",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted || started !== revision) return;
        setConnections(rows);
        const saved =
          new URL(window.location.href).searchParams.get("backend") ||
          sessionStorage.getItem("console.backend") ||
          "";
        const next = rows.some((item) => item.id === saved) ? saved : "";
        sessionStorage.setItem("console.backend", next);
        setId(next);
        setReady(true);
        setConnectionError("");
      } catch {
        if (controller.signal.aborted || started !== revision) return;
        setReady(true);
        setConnectionError("Connection settings unavailable. Retrying…");
      } finally {
        if (!controller.signal.aborted && started === revision)
          timer = setTimeout(refresh, 5000);
      }
    }
    void refresh();
    window.addEventListener("console:backends-changed", refresh);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("console:backends-changed", refresh);
    };
  }, []);
  const machine = connections.find((item) => item.id === id);
  const disconnected =
    !id && !management ? (
      <section className="m-auto w-full max-w-lg space-y-5 p-8">
        <MonitorIcon className="size-8 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect your workspace
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Choose a saved machine in the sidebar, or connect one to work with its
          projects and conversations.
        </p>
        <Link
          href="/machines"
          className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"
        >
          Connect a machine
        </Link>
      </section>
    ) : undefined;
  return (
    <BackendContext value={{ id, connections, select }}>
      <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <Link
            href={ready ? workspaceLocation() : "/chat"}
            className="flex items-center gap-2 font-semibold"
          >
            <TerminalSquareIcon className="size-5" />
            Console
          </Link>
          <div className="flex items-center gap-3">
            {machine && (
              <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <MonitorIcon className="size-3.5" />
                {machine.name}
              </span>
            )}
            {management ? (
              <Link
                href={ready ? workspaceLocation() : "/chat"}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-accent"
              >
                <ArrowLeftIcon className="size-4" />
                Back to chat
              </Link>
            ) : (
              <Link
                href="/settings"
                aria-label="Open settings"
                title="Settings"
                className="flex size-8 items-center justify-center rounded-lg hover:bg-accent"
              >
                <SettingsIcon className="size-4" />
              </Link>
            )}
          </div>
        </header>
        {ready ? (
          <Suspense
            fallback={
              <p className="p-6 text-sm text-muted-foreground">
                Opening workspace…
              </p>
            }
          >
            <ChatWorkspace
              key={id}
              management={management ? children : disconnected}
            />
          </Suspense>
        ) : (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            {connectionError || "Connecting to Console…"}
          </p>
        )}
      </div>
    </BackendContext>
  );
}

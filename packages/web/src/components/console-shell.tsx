"use client";

import {
  HomeIcon,
  MessageSquareIcon,
  SettingsIcon,
  TerminalSquareIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { BackendContext } from "@/components/connection-context";
import { SettingsWindow } from "@/components/settings-window";
import { Button } from "@/components/ui/button";
import { api, type BackendConnection } from "@/lib/console-api";

export { useBackend } from "@/components/connection-context";
export function ConsoleShell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const show = () => setSettingsOpen(true);
    window.addEventListener("console:open-settings", show);
    return () => window.removeEventListener("console:open-settings", show);
  }, []);
  const [id, setId] = useState("");
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connections, setConnections] = useState<BackendConnection[]>([]);
  const pathname = usePathname();
  function select(next: string) {
    sessionStorage.setItem("console.backend", next);
    const url = new URL(window.location.href);
    for (const key of ["session", "conversation", "workspace", "new"])
      url.searchParams.delete(key);
    url.searchParams.set("backend", next);
    window.history.replaceState(null, "", url.pathname + url.search);
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
  return (
    <BackendContext value={{ id, connections, select }}>
      <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <TerminalSquareIcon className="size-5" aria-hidden="true" />
            Console
          </Link>
          <nav aria-label="Application" className="flex items-center gap-1">
            <Link
              href="/"
              aria-label="Home"
              title="Home"
              aria-current={pathname === "/" ? "page" : undefined}
              className={`inline-flex size-8 items-center justify-center hover:bg-accent ${pathname === "/" ? "bg-accent" : ""}`}
            >
              <HomeIcon className="size-4" />
            </Link>
            {!!id && (
              <Link
                href="/chat"
                aria-label="Conversations"
                title="Chat"
                aria-current={pathname === "/chat" ? "page" : undefined}
                className={`inline-flex size-8 items-center justify-center hover:bg-accent ${pathname === "/chat" ? "bg-accent" : ""}`}
              >
                <MessageSquareIcon className="size-4" />
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
            </Button>
          </nav>
        </header>
        <div key={id} className="flex min-h-0 flex-1 flex-col overflow-auto">
          {ready ? (
            id || pathname === "/machines" ? (
              children
            ) : (
              <main className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:py-12">
                <header className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Get started
                  </p>
                  <h1 className="text-3xl font-semibold">
                    {connections.length
                      ? "Select or connect a machine"
                      : "Connect your first machine"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Connect a machine to open its projects and conversations.
                  </p>
                </header>
                {connectionError && <p role="alert">{connectionError}</p>}
                <Link
                  href="/machines"
                  className="inline-flex bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Connect a machine
                </Link>
              </main>
            )
          ) : (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              {connectionError || "Connecting to Console…"}
            </p>
          )}
        </div>
        <SettingsWindow
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    </BackendContext>
  );
}

"use client";

import { PlusIcon, TerminalSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { Button } from "@/components/ui/button";
import { api, type BackendConnection } from "@/lib/console-api";

const BackendContext = createContext({
  id: "local",
  connections: [] as BackendConnection[],
  select: (_id: string) => {},
});
export const useBackend = () => useContext(BackendContext);

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [id, setId] = useState("local");
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connections, setConnections] = useState<BackendConnection[]>([]);
  const pathname = usePathname();
  const router = useRouter();
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
          "local";
        const next = rows.some((item) => item.id === saved) ? saved : "local";
        sessionStorage.setItem("console.backend", next);
        setId(next);
        setReady(true);
        setConnectionError("");
      } catch {
        if (controller.signal.aborted || started !== revision) return;
        setConnectionError("Local Console hub unavailable. Retrying…");
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
          <div className="flex items-center gap-3">
            <div className="w-44">
              <ChoiceSelect
                label="Active machine"
                value={id}
                items={
                  connections.length
                    ? connections.map((item) => ({
                        value: item.id,
                        label: item.name,
                      }))
                    : [{ value: "local", label: "Local machine" }]
                }
                onChange={select}
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (pathname === "/chat")
                  window.dispatchEvent(new Event("console:new-session"));
                else router.push("/chat?new=1");
              }}
            >
              <PlusIcon data-icon="inline-start" />
              New session
            </Button>
          </div>
        </header>
        <nav
          className="flex shrink-0 gap-5 overflow-x-auto border-b px-4 py-3 text-xs"
          aria-label="Console navigation"
        >
          {[
            ["/", "Home"],
            ["/chat", "Conversations"],
            ["/machines", "Machines"],
            ["/workspaces", "Projects"],
            ["/settings/providers", "Providers"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`whitespace-nowrap ${pathname === href ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div key={id} className="flex min-h-0 flex-1 flex-col overflow-auto">
          {ready ? (
            children
          ) : (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              {connectionError || "Connecting to Console…"}
            </p>
          )}
        </div>
      </div>
    </BackendContext>
  );
}

"use client";

import { Settings2Icon, TerminalSquareIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionChat } from "@/components/session-chat";
import { SessionInspector } from "@/components/session-inspector";
import { SessionSidebar } from "@/components/session-sidebar";
import {
  ApiError,
  api,
  type Conversation,
  type Provider,
  type SessionSummary,
} from "@/lib/console-api";

type Submission = { text: string; requestId: string };

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState("");
  const selectedRef = useRef("");
  const epoch = useRef(0);
  const [snapshot, setSnapshot] = useState<Conversation>();
  const [online, setOnline] = useState(false);
  const [detailOnline, setDetailOnline] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<
    Record<string, Submission | undefined>
  >({});
  const session = snapshot?.id === selected ? snapshot : undefined;
  const select = useCallback((id: string) => {
    selectedRef.current = id;
    setSelected(id);
    setDirty(false);
    setError("");
    setDetailOnline(false);
    window.history.replaceState(null, "", `?session=${encodeURIComponent(id)}`);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let initial = true;
    api<Provider[]>("/providers", "GET", undefined, controller.signal)
      .then(setProviders)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    async function poll() {
      try {
        const items = await api<SessionSummary[]>(
          "/sessions",
          "GET",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSessions(items);
        setOnline(true);
        if (initial) {
          initial = false;
          const id =
            new URL(window.location.href).searchParams.get("session") ||
            items[0]?.id;
          if (id && !selectedRef.current) select(id);
        }
      } catch {
        if (!controller.signal.aborted) setOnline(false);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [select]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const started = epoch.current;
      try {
        const current = await api<Conversation>(
          `/sessions/${encodeURIComponent(selected)}`,
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted && started === epoch.current) {
          setSnapshot(current);
          setDetailOnline(true);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setDetailOnline(false);
          setError((cause as Error).message);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selected]);

  async function operate(id: string, action: () => Promise<void>) {
    ++epoch.current;
    setWorking(true);
    setError("");
    try {
      await action();
      const current = await api<Conversation>(`/sessions/${id}`);
      ++epoch.current;
      if (selectedRef.current === id) {
        setSnapshot(current);
        setDetailOnline(true);
      }
      setSessions(await api<SessionSummary[]>("/sessions"));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      ++epoch.current;
      setWorking(false);
    }
  }
  async function send() {
    if (!session || working) return;
    const id = session.id;
    const input = pending[id] ?? {
      text: drafts[id] ?? "",
      requestId: crypto.randomUUID(),
    };
    setPending((items) => ({ ...items, [id]: input }));
    await operate(id, async () => {
      try {
        await api(`/sessions/${id}/messages`, "POST", input);
      } catch (cause) {
        if (
          cause instanceof ApiError &&
          [400, 403, 404, 409, 413, 415].includes(cause.status)
        )
          setPending((items) => ({ ...items, [id]: undefined }));
        throw cause;
      }
      setPending((items) => ({ ...items, [id]: undefined }));
      setDrafts((items) => ({
        ...items,
        [id]: items[id] === input.text ? "" : (items[id] ?? ""),
      }));
    });
  }
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground lg:h-svh">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <TerminalSquareIcon className="size-5" aria-hidden="true" />
          <h1 className="font-semibold tracking-tight">Console</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Local agent workspace
          </span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-xs text-muted-foreground" role="status">
            {online ? "Backend connected" : "Backend unavailable"}
          </span>
          <Link
            href="/settings/providers"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Settings2Icon className="size-4" aria-hidden="true" />
            Providers
          </Link>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="shrink-0 border-b px-5 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <main className="grid flex-1 lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <SessionSidebar
          sessions={sessions}
          selected={selected}
          working={working || !online}
          onSelect={select}
          onCreate={async (name, requestId) => {
            setWorking(true);
            setError("");
            try {
              const created = await api<Conversation>("/sessions", "POST", {
                name,
                requestId,
              });
              select(created.id);
              setSnapshot(created);
              setDetailOnline(true);
              setSessions(await api<SessionSummary[]>("/sessions"));
              return true;
            } catch (cause) {
              setError((cause as Error).message);
              return false;
            } finally {
              setWorking(false);
            }
          }}
        />
        {session ? (
          <>
            <SessionChat
              session={session}
              online={online && detailOnline}
              working={working}
              dirty={dirty}
              configured={Boolean(
                providers.find(
                  (provider) => provider.id === session.model?.provider,
                )?.configured,
              )}
              text={drafts[session.id] ?? ""}
              uncertain={Boolean(pending[session.id])}
              onText={(text) =>
                setDrafts((items) => ({ ...items, [session.id]: text }))
              }
              onSend={() => void send()}
              onControl={(action) =>
                void operate(session.id, async () => {
                  await api(`/sessions/${session.id}/${action}`, "POST");
                })
              }
            />
            <SessionInspector
              key={session.id}
              session={session}
              providers={providers}
              disabled={
                working || !online || !detailOnline || session.status !== "idle"
              }
              onDirtyChange={setDirty}
              onSave={(input) =>
                operate(session.id, async () => {
                  await api(`/sessions/${session.id}/config`, "PATCH", input);
                })
              }
            />
          </>
        ) : (
          <section className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center lg:col-span-2">
            <TerminalSquareIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-xl font-medium">
              {selected ? "Opening session…" : "A place for each conversation"}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {selected
                ? "The backend owns saved history and execution state."
                : "Create a named session, connect a provider, and choose how you want the model to think."}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

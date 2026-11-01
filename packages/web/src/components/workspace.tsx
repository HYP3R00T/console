"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  api,
  type ChatMessage,
  fieldClass,
  type HistoryPage,
  type Project,
  type Provider,
  type Session,
  type SessionSummary,
} from "@/lib/api";
import { mergeMessages } from "@/lib/history";
import { startPolling } from "@/lib/poll";

type PendingInput = { text: string; requestId: string };
function pendingInput(key: string): PendingInput | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value &&
      typeof value.text === "string" &&
      typeof value.requestId === "string"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function Workspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const creation = useRef<{ name: string; requestId: string } | undefined>(
    undefined,
  );
  const registration = useRef<
    { name: string; path: string; requestId: string } | undefined
  >(undefined);
  useEffect(() => {
    const url = new URL(window.location.href);
    setProjectId(url.searchParams.get("project") ?? "");
    setSessionId(url.searchParams.get("session") ?? "");
    return startPolling({
      interval: 2000,
      read: (signal) => api<Project[]>("/projects", "GET", undefined, signal),
      onValue: setProjects,
      onError: (cause) => setError(cause.message),
    });
  }, []);
  useEffect(() => {
    if (!projectId) return;
    return startPolling({
      interval: 2000,
      read: (signal) =>
        api<SessionSummary[]>(
          `/projects/${projectId}/sessions`,
          "GET",
          undefined,
          signal,
        ),
      onValue: setSessions,
      onError: (cause) => setError(cause.message),
    });
  }, [projectId]);
  function select(project: string, session = "") {
    setProjectId(project);
    setSessionId(session);
    const url = new URL(window.location.href);
    url.searchParams.set("project", project);
    if (session) url.searchParams.set("session", session);
    else url.searchParams.delete("session");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  async function act(operation: () => Promise<void>) {
    setWorking(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const project = projects.find((item) => item.id === projectId);
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b p-4">
        <h1 className="font-semibold">Console</h1>
        <Link href="/settings" className="text-sm underline">
          Model access
        </Link>
      </header>
      <div className="grid flex-1 md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-5 border-b p-4 md:border-r md:border-b-0">
          <h2 className="font-medium">Projects</h2>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <nav aria-label="Projects" className="grid gap-2">
            {projects.map((item) => (
              <Button
                variant={item.id === projectId ? "secondary" : "ghost"}
                className="justify-start"
                key={item.id}
                onClick={() => {
                  setSessions([]);
                  creation.current = undefined;
                  select(item.id);
                }}
              >
                {item.name}
              </Button>
            ))}
          </nav>
          <details>
            <summary className="text-sm">Register existing directory</summary>
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  registration.current ??= {
                    name,
                    path,
                    requestId: crypto.randomUUID(),
                  };
                  try {
                    const item = await api<Project>(
                      "/projects",
                      "POST",
                      registration.current,
                    );
                    registration.current = undefined;
                    setProjects(await api<Project[]>("/projects"));
                    setSessions([]);
                    select(item.id);
                    setName("");
                    setPath("");
                  } catch (cause) {
                    if (cause instanceof ApiError && cause.status < 500)
                      registration.current = undefined;
                    throw cause;
                  }
                });
              }}
            >
              <label className="block text-sm">
                Name
                <input
                  required
                  maxLength={80}
                  className={fieldClass}
                  value={name}
                  disabled={working || Boolean(registration.current)}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                Absolute path
                <input
                  required
                  className={fieldClass}
                  value={path}
                  disabled={working || Boolean(registration.current)}
                  onChange={(event) => setPath(event.target.value)}
                />
              </label>
              <Button disabled={working}>Register / retry</Button>
            </form>
          </details>
          {project && (
            <section key={project.id} className="space-y-3">
              <p className="wrap-break-word text-xs text-muted-foreground">
                {project.path}
              </p>
              <details>
                <summary className="text-sm">Rename project</summary>
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void act(async () => {
                      await api(`/projects/${projectId}`, "PATCH", {
                        name: form.get("name"),
                      });
                      setProjects(await api<Project[]>("/projects"));
                    });
                  }}
                >
                  <input
                    name="name"
                    aria-label="Project name"
                    required
                    maxLength={80}
                    defaultValue={project.name}
                    className={fieldClass}
                  />
                  <Button disabled={working}>Save name</Button>
                </form>
              </details>
              <h2 className="font-medium">Work sessions</h2>
              <nav aria-label="Work sessions" className="grid gap-2">
                {sessions.map((item) => (
                  <Button
                    variant={item.id === sessionId ? "secondary" : "ghost"}
                    className="h-auto justify-start whitespace-normal py-2 text-left"
                    key={item.id}
                    onClick={() => select(projectId, item.id)}
                  >
                    {item.name} · {item.status}
                  </Button>
                ))}
              </nav>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(async () => {
                    creation.current ??= {
                      name: sessionName,
                      requestId: crypto.randomUUID(),
                    };
                    try {
                      const item = await api<Session>(
                        `/projects/${projectId}/sessions`,
                        "POST",
                        creation.current,
                      );
                      creation.current = undefined;
                      setSessionName("");
                      setSessions(
                        await api<SessionSummary[]>(
                          `/projects/${projectId}/sessions`,
                        ),
                      );
                      select(projectId, item.id);
                    } catch (cause) {
                      if (cause instanceof ApiError && cause.status < 500)
                        creation.current = undefined;
                      throw cause;
                    }
                  });
                }}
              >
                <label className="block text-sm">
                  New session name
                  <input
                    required
                    maxLength={80}
                    className={fieldClass}
                    value={sessionName}
                    disabled={working || Boolean(creation.current)}
                    onChange={(event) => setSessionName(event.target.value)}
                  />
                </label>
                <Button disabled={working}>Create / retry</Button>
              </form>
            </section>
          )}
        </aside>
        <main className="min-w-0">
          {sessionId && project ? (
            <SessionView
              key={sessionId}
              id={sessionId}
              onDeleted={() => {
                setSessions((items) =>
                  items.filter((item) => item.id !== sessionId),
                );
                select(projectId);
              }}
            />
          ) : (
            <div className="space-y-2 p-8">
              <h2 className="text-lg font-medium">
                Choose a project and work session
              </h2>
              <p className="text-sm text-muted-foreground">
                Each session has one conversation. One session can execute per
                project at a time.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SessionView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const base = `/sessions/${id}`;
  const key = `console.pending.${id}`;
  const [session, setSession] = useState<Session>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [hasOlder, setHasOlder] = useState(false);
  const [provider, setProvider] = useState<Provider>();
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [instructions, setInstructions] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingInput>();
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [working, setWorking] = useState(false);
  const initialized = useRef(false);
  const olderLoaded = useRef(false);
  useEffect(() => {
    const saved = pendingInput(key);
    setPending(saved);
    if (saved) setText(saved.text);
    return startPolling({
      interval: 1000,
      read: async (signal) =>
        Promise.all([
          api<Session>(base, "GET", undefined, signal),
          api<Provider>("/provider", "GET", undefined, signal),
        ]),
      onValue: ([next, available]) => {
        setSession(next);
        setProvider(available);
        setOnline(true);
        setMessages((previous) => mergeMessages(previous, next.messages));
        if (!olderLoaded.current) {
          setHasOlder(next.hasOlder);
          setCursor(next.olderCursor);
        }
        if (!initialized.current && next.status !== "unavailable") {
          setModel(next.model ?? "");
          setThinking(next.thinkingLevel ?? "");
          setInstructions(next.instructions ?? "");
          initialized.current = true;
        }
      },
      onError: (cause) => {
        setOnline(false);
        setError(cause.message);
      },
    });
  }, [base, key]);
  async function act(operation: () => Promise<void>) {
    setWorking(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const idle = session?.status === "idle";
  const selected = provider?.models.find((item) => item.id === model);
  const levels = selected?.thinkingLevels ?? [];
  async function send() {
    const input = pending ?? { text, requestId: crypto.randomUUID() };
    // Save before sending. Reconnect/reload never submits automatically; Retry preserves this exact request.
    sessionStorage.setItem(key, JSON.stringify(input));
    setPending(input);
    try {
      await api(`${base}/messages`, "POST", input);
      sessionStorage.removeItem(key);
      setPending(undefined);
      setText("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) {
        sessionStorage.removeItem(key);
        setPending(undefined);
      }
      throw cause;
    }
  }
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">
          {session?.name ?? "Opening session…"}
        </h2>
        <span role="status" className="text-sm">
          {online ? session?.status : "Disconnected · status unknown"}
        </span>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {session?.failure && (
        <p role="alert" className="text-sm text-destructive">
          {session.failure}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={working || !online || !session || idle}
          onClick={() =>
            void act(async () => {
              await api(`${base}/cancel`, "POST");
            })
          }
        >
          Cancel work
        </Button>
        <Button
          variant="outline"
          disabled={
            working ||
            !online ||
            !["interrupted", "unavailable"].includes(session?.status ?? "")
          }
          onClick={() =>
            void act(async () => {
              await api(`${base}/resume`, "POST");
            })
          }
        >
          Resume explicitly
        </Button>
      </div>
      <details>
        <summary className="text-sm">Session settings</summary>
        <div className="mt-3 space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void act(async () => {
                const next = await api<Session>(base, "PATCH", {
                  name: form.get("name"),
                });
                setSession(next);
              });
            }}
          >
            <label className="text-sm">
              Name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={session?.name}
                className={fieldClass}
              />
            </label>
            <Button className="self-end" disabled={working}>
              Rename
            </Button>
          </form>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                const next = await api<Session>(`${base}/config`, "PATCH", {
                  model,
                  thinkingLevel: thinking,
                  instructions,
                });
                setSession(next);
              });
            }}
          >
            <label className="block text-sm">
              Model
              <select
                className={fieldClass}
                value={model}
                disabled={!idle || working || Boolean(pending)}
                onChange={(event) => {
                  setModel(event.target.value);
                  setThinking(
                    provider?.models.find(
                      (item) => item.id === event.target.value,
                    )?.thinkingLevels[0] ?? "off",
                  );
                }}
              >
                <option value="">Choose connected model</option>
                {provider?.models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Thinking
              <select
                className={fieldClass}
                value={thinking}
                disabled={!idle || working || Boolean(pending)}
                onChange={(event) => setThinking(event.target.value)}
              >
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Instructions
              <textarea
                className={fieldClass}
                rows={3}
                maxLength={16000}
                disabled={!idle || working || Boolean(pending)}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </label>
            <Button
              disabled={
                !idle ||
                working ||
                Boolean(pending) ||
                !model ||
                !provider?.configured
              }
            >
              Save configuration
            </Button>
          </form>
          <Button
            variant="destructive"
            disabled={!idle || working || Boolean(pending)}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this session’s entire history? Project files remain. This cannot be undone.",
                )
              )
                void act(async () => {
                  await api(base, "DELETE");
                  onDeleted();
                });
            }}
          >
            Delete session history
          </Button>
        </div>
      </details>
      {hasOlder && (
        <Button
          variant="outline"
          disabled={working}
          onClick={() =>
            void act(async () => {
              const page = await api<HistoryPage>(
                `${base}/history?before=${encodeURIComponent(cursor ?? "")}`,
              );
              olderLoaded.current = true;
              setMessages((previous) => mergeMessages(previous, page.messages));
              setHasOlder(page.hasOlder);
              setCursor(page.olderCursor);
            })
          }
        >
          Load older history
        </Button>
      )}
      <section className="space-y-5" aria-label="Conversation history">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {session?.partial && (
          <article className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Assistant · in progress
            </p>
            <ChatMarkdown text={session.partial} />
          </article>
        )}
        {session?.liveTools.map((tool) => (
          <details key={tool.id}>
            <summary className="text-sm">
              {tool.name} · {tool.status}
            </summary>
            <pre className="overflow-auto whitespace-pre-wrap wrap-break-word text-xs">
              {tool.output ?? "No output yet."}
            </pre>
          </details>
        ))}
      </section>
      {session?.outcome && (
        <p className="text-xs text-muted-foreground">
          Last input: {session.outcome}. An answer is not independent
          verification.
        </p>
      )}
      {session?.compactionFailed && (
        <p role="alert" className="text-sm text-destructive">
          Automatic context compaction failed. Check provider access and server
          diagnostics.
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void act(send);
        }}
      >
        <label className="block text-sm">
          Message
          <textarea
            className={fieldClass}
            rows={4}
            maxLength={32000}
            value={text}
            disabled={working || Boolean(pending)}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <Button
          disabled={
            working ||
            !online ||
            (!pending && (!idle || !session?.model || !text.trim()))
          }
        >
          {pending ? "Retry same message" : "Send"}
        </Button>
        {pending && (
          <p className="text-xs text-muted-foreground">
            Delivery uncertain. Retry preserves the original request ID and
            text.
          </p>
        )}
      </form>
    </section>
  );
}
function Message({ message }: { message: ChatMessage }) {
  const activity =
    message.role === "toolResult" || Boolean(message.toolCalls?.length);
  return (
    <article className="min-w-0 space-y-2">
      <p className="text-xs text-muted-foreground">
        {message.role}
        {message.isError ? " · failed" : ""}
        {message.kind === "pi.compaction" ? " · context summary" : ""}
      </p>
      {[...new Set(message.reasoning ?? [])].map((part) => (
        <details key={part}>
          <summary className="text-xs">Reasoning</summary>
          <p className="whitespace-pre-wrap text-sm">{part}</p>
        </details>
      ))}
      {activity ? (
        <details>
          <summary className="text-sm">
            {message.toolName ??
              message.toolCalls?.map((call) => call.name).join(", ") ??
              "Tool activity"}
            {message.toolCallId ? ` · ${message.toolCallId}` : ""}
          </summary>
          {message.toolCalls?.map((call) => (
            <pre
              key={call.id}
              className="overflow-auto whitespace-pre-wrap wrap-break-word text-xs"
            >
              {call.id}
              {"\n"}
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          ))}
          <pre className="overflow-auto whitespace-pre-wrap wrap-break-word text-xs">
            {message.text}
          </pre>
        </details>
      ) : (
        message.text && <ChatMarkdown text={message.text} />
      )}
    </article>
  );
}

"use client";

import { DatabaseIcon, MonitorIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useBackend } from "@/components/machines/connection-context";
import { BackendConnections } from "@/components/machines/connections";
import { api, type Machine } from "@/lib/api";

export default function Machines() {
  const { id } = useBackend();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const items = await api<Machine[]>(
          "/machines",
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setMachines(items);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError("Backend unavailable. Machine information may be stale.");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-8 sm:px-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Connections
        </p>
        <h1 className="text-3xl font-semibold">Machines</h1>
        <p className="text-sm text-muted-foreground">
          Execution and saved conversations belong to the machine.
        </p>
      </header>

      <BackendConnections />
      {error && (
        <p
          role="alert"
          className="border border-destructive p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {id && !machines.length && !error && (
        <p className="text-sm text-muted-foreground">
          Loading machine information…
        </p>
      )}
      {machines.map((machine) => (
        <section key={machine.id} className="space-y-6 border p-5 sm:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MonitorIcon className="size-5" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">{machine.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {machine.platform} / {machine.architecture}
                </p>
              </div>
            </div>
            <span className="border px-2 py-1 text-xs">
              {error ? "Unknown" : machine.status}
            </span>
          </header>
          <dl className="grid grid-cols-3 gap-4 border-y py-4">
            {[
              ["Sessions", machine.sessions],
              ["Unfinished", machine.activeSessions],
              ["Unavailable", machine.unavailableSessions],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-2xl tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <DatabaseIcon className="size-4" aria-hidden="true" />
              Persistent storage
            </h3>
            <dl className="space-y-3 text-sm">
              {[
                ["Data directory", machine.storage.directory],
                ["Session catalog", machine.storage.catalog],
                ["Provider credentials", machine.storage.credentials],
                [
                  "Conversation databases",
                  `${machine.storage.sessions}/<session-id>/conversation.sqlite`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 wrap-break-word font-mono text-xs">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Location source: {machine.storage.source}. Legacy
              conversation.sqlite remains in the data directory when present.
              Credentials are stored locally without encryption.
            </p>
          </section>

          <p className="border-t pt-4 text-xs text-muted-foreground">
            This is the selected execution machine. Saved connections belong to
            this web app. Native Pi tools and shell commands execute directly on
            the backend host.
          </p>
        </section>
      ))}
    </main>
  );
}

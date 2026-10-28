"use client";

import { RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Connection = "checking" | "connected" | "unavailable";

const connectionLabels: Record<Connection, string> = {
  checking: "Checking server connection…",
  connected: "Server connected",
  unavailable: "Server unavailable. Start the server and refresh this page.",
};

export default function Home() {
  const [connection, setConnection] = useState<Connection>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Health request failed");
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          body === null ||
          !("status" in body) ||
          body.status !== "ok"
        ) {
          throw new Error("Unexpected health response");
        }
        if (!controller.signal.aborted) setConnection("connected");
      } catch {
        if (!controller.signal.aborted) setConnection("unavailable");
      }
    }

    void checkConnection();
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Development starter
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Console
        </h1>
        <p className="text-sm text-muted-foreground">The web app is running.</p>
      </header>
      <section
        className="flex flex-wrap items-center gap-4 border-t border-border pt-6"
        aria-label="Server connection"
      >
        <p
          role="status"
          aria-live="polite"
          className="text-sm"
          data-state={connection}
        >
          {connectionLabels[connection]}
        </p>
        <Button
          variant="outline"
          disabled={connection === "checking"}
          onClick={() => window.location.reload()}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Refresh
        </Button>
      </section>
    </main>
  );
}

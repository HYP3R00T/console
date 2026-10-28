"use client";

import { useState } from "react";
import { useBackend } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import { api, type BackendConnection, fieldClass } from "@/lib/console-api";

export function BackendConnections() {
  const { connections, id, select } = useBackend();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function act(operation: () => Promise<void>) {
    setError("");
    setWorking(true);
    try {
      await operation();
      window.dispatchEvent(new Event("console:backends-changed"));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="space-y-5 border p-5">
      <h2 className="font-semibold">Machines</h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {connections.map((backend) => (
          <div
            key={backend.id}
            className="flex flex-wrap items-center justify-between gap-3 border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {backend.name}
                {id === backend.id ? " · selected" : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {backend.local ? "This Console installation" : backend.url} ·{" "}
                {backend.status}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={working || id === backend.id}
                onClick={() => select(backend.id)}
              >
                Use machine
              </Button>
              {!backend.local && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() =>
                      void act(async () => {
                        await api(`/backends/${backend.id}/check`, "POST");
                      })
                    }
                  >
                    Check
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() =>
                      void act(async () => {
                        await api(`/backends/${backend.id}`, "DELETE");
                        if (id === backend.id) select("local");
                      })
                    }
                  >
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="grid gap-4 border-t pt-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void act(async () => {
            const result = await api<BackendConnection>("/backends", "POST", {
              name,
              url,
              token,
            });
            setName("");
            setUrl("");
            setToken("");
            select(result.id);
          });
        }}
      >
        <h3 className="text-sm font-medium sm:col-span-2">Add a machine</h3>
        <label className="space-y-2 text-sm">
          Name
          <input
            required
            maxLength={80}
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={working}
          />
        </label>
        <label className="space-y-2 text-sm">
          Machine address
          <input
            type="url"
            required
            className={fieldClass}
            placeholder="https://console.example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={working}
          />
        </label>
        <label className="space-y-2 text-sm sm:col-span-2">
          Access token
          <input
            type="password"
            autoComplete="off"
            required
            maxLength={4096}
            className={fieldClass}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={working}
          />
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
          Set CONSOLE_ACCESS_TOKEN on the destination backend. Use HTTPS or a
          loopback HTTP URL through an SSH tunnel. The token is saved only by
          this local hub and injected server-side; it is never returned to the
          browser. Reconnect the same origin to update its name or token.
        </p>
        <Button
          type="submit"
          disabled={working || !name.trim() || !url || !token}
        >
          {working ? "Checking…" : "Connect machine"}
        </Button>
      </form>
    </section>
  );
}

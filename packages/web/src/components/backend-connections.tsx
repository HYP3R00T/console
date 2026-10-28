"use client";
import { useEffect, useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useBackend } from "@/components/connection-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ApiError,
  api,
  type BackendConnection,
  fieldClass,
} from "@/lib/console-api";
export function BackendConnections() {
  const { connections, id, select } = useBackend();
  const [recent, setRecent] = useState<BackendConnection[]>([]);
  const [url, setUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [backendPort, setBackendPort] = useState(3000);
  const [transport, setTransport] = useState("http");
  const [token, setToken] = useState("");
  const [authentication, setAuthentication] = useState("");
  const [reconnectToken, setReconnectToken] = useState("");
  const [reconnecting, setReconnecting] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    void api<BackendConnection[]>("/backends/history")
      .then(setRecent)
      .catch((error) => setError(error.message));
  }, []);
  async function act(operation: () => Promise<void>) {
    setError("");
    setWorking(true);
    try {
      await operation();
      setRecent(await api("/backends/history"));
      window.dispatchEvent(new Event("console:backends-changed"));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function reconnect(machineId: string, accessToken?: string) {
    setReconnecting(machineId);
    try {
      await act(async () => {
        try {
          const result = await api<BackendConnection>(
            `/backends/${machineId}/reconnect`,
            "POST",
            accessToken ? { token: accessToken } : undefined,
          );
          setAuthentication("");
          setReconnectToken("");
          select(result.id);
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) {
            setAuthentication(machineId);
            setReconnectToken("");
            setError("This machine requires an access token to reconnect.");
            return;
          }
          throw cause;
        }
      });
    } finally {
      setReconnecting("");
    }
  }
  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!!connections.length && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Connected machines</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {connections.map((machine) => (
              <div
                key={machine.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {machine.name}
                    {id === machine.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Selected
                      </span>
                    )}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {machine.url} · {machine.status}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working || id === machine.id}
                    onClick={() => select(machine.id)}
                  >
                    Select
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() =>
                      void act(async () => {
                        await api(`/backends/${machine.id}`, "DELETE");
                        if (id === machine.id) select("");
                      })
                    }
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Connect a machine</h2>
          </CardTitle>
          <CardDescription>
            Connect directly to a Console server or through SSH.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                const result = await api<BackendConnection>(
                  "/backends",
                  "POST",
                  {
                    url: transport === "ssh" ? "http://127.0.0.1" : url,
                    token,
                    ...(transport === "ssh"
                      ? { ssh: { host, port, backendPort } }
                      : {}),
                  },
                );
                setToken("");
                select(result.id);
              });
            }}
          >
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                Connection method
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["http", "Server address"],
                  ["ssh", "SSH tunnel"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={transport === value ? "secondary" : "outline"}
                    aria-pressed={transport === value}
                    disabled={working}
                    onClick={() => setTransport(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
            {transport === "http" ? (
              <div className="space-y-2">
                <label className="block space-y-2 text-sm">
                  Server address
                  <input
                    type="url"
                    required
                    disabled={working}
                    className={fieldClass}
                    placeholder="http://127.0.0.1:3000"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={() =>
                      void act(async () => {
                        const result = await api<{
                          url: string;
                          name?: string;
                        }>("/backends/detect-local", "POST");
                        setUrl(result.url);
                      })
                    }
                  >
                    Check local server
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block space-y-2 text-sm">
                  SSH host or alias
                  <input
                    required
                    disabled={working}
                    className={fieldClass}
                    placeholder="user@host or SSH alias"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    SSH port
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      disabled={working}
                      className={fieldClass}
                      value={port}
                      onChange={(event) => setPort(Number(event.target.value))}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    Remote Console port
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      disabled={working}
                      className={fieldClass}
                      value={backendPort}
                      onChange={(event) =>
                        setBackendPort(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Uses this computer’s SSH keys and trusted hosts. The remote
                  Console server must already be running.
                </p>
              </div>
            )}
            <label className="block space-y-2 text-sm">
              Access token (if required)
              <input
                type="password"
                autoComplete="off"
                maxLength={4096}
                disabled={working}
                className={fieldClass}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                The connected server supplies the machine name.
              </p>
              <Button
                type="submit"
                disabled={
                  working || !(transport === "ssh" ? host.trim() : url.trim())
                }
              >
                {working ? "Connecting…" : "Connect machine"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {!!recent.length && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Recent machines</h2>
            </CardTitle>
            <CardDescription>
              Disconnected machines saved for reconnection.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {recent.map((machine) => (
              <div
                key={machine.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{machine.name}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {machine.url}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() => void reconnect(machine.id)}
                  >
                    {reconnecting === machine.id
                      ? "Reconnecting…"
                      : "Reconnect"}
                  </Button>
                  <ConfirmDelete
                    label={`Forget ${machine.name}`}
                    disabled={working}
                    onConfirm={() =>
                      void act(async () => {
                        await api(`/backends/${machine.id}/forget`, "DELETE");
                      })
                    }
                  />
                </div>
                {authentication === machine.id && (
                  <form
                    className="flex w-full flex-wrap items-end gap-2 border-t pt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void reconnect(machine.id, reconnectToken);
                    }}
                  >
                    <label className="min-w-0 flex-1 space-y-2 text-sm">
                      Access token for {machine.name}
                      <input
                        type="password"
                        autoComplete="off"
                        required
                        maxLength={4096}
                        disabled={working}
                        className={fieldClass}
                        value={reconnectToken}
                        onChange={(event) =>
                          setReconnectToken(event.target.value)
                        }
                      />
                    </label>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={working || !reconnectToken.trim()}
                    >
                      Reconnect
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={working}
                      onClick={() => {
                        setAuthentication("");
                        setReconnectToken("");
                        setError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

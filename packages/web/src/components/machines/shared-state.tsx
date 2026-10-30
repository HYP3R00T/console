"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { startPolling } from "@/lib/poll";

type State = { revision: number; value: Record<string, unknown> };
export function SharedState({
  active = true,
  path = "/state",
  project = false,
}: {
  active?: boolean;
  path?: string;
  project?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<State>();
  const [draft, setDraft] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const reload = useCallback(async () => {
    const value = await api<State>(path);
    setSnapshot(value);
    setDraft(undefined);
    setRevision(value.revision);
  }, [path]);
  useEffect(() => {
    if (!active) return;
    return startPolling({
      read: (signal) => api<State>(path, "GET", undefined, signal),
      onValue: setSnapshot,
      onError: (cause) => setError(cause.message),
      interval: 1500,
    });
  }, [active, path]);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setWorking(true);
        setError("");
        try {
          const value = JSON.parse(draft ?? "{}");
          await api(path, "PUT", { value, revision });
          await reload();
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setWorking(false);
        }
      }}
    >
      <h2 className="font-semibold">
        {project ? "Project memory" : "Machine shared state"}
      </h2>
      <p className="text-xs text-muted-foreground">
        {project
          ? "Shared facts for this project; conversation histories remain separate"
          : "All projects on this machine"}{" "}
        · revision {snapshot?.revision ?? "…"}. Never store credentials.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <dl className="divide-y text-xs">
        {Object.entries(snapshot?.value ?? {}).map(([key, value]) => (
          <div key={key} className="py-2">
            <dt className="font-medium">{key}</dt>
            <dd className="mt-1 truncate font-mono text-muted-foreground">
              {JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
      {snapshot && !Object.keys(snapshot.value).length && (
        <p className="text-xs text-muted-foreground">No shared data yet.</p>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-medium">
          Edit shared JSON
        </summary>
        <textarea
          aria-label="Shared state JSON"
          className="min-h-64 w-full border bg-background p-3 font-mono text-xs"
          disabled={!snapshot || working}
          maxLength={65536}
          value={draft ?? JSON.stringify(snapshot?.value ?? {}, null, 2)}
          onChange={(event) => {
            if (draft === undefined) setRevision(snapshot?.revision ?? 0);
            setDraft(event.target.value);
          }}
        />
        <div className="flex gap-2">
          <Button disabled={working || draft === undefined}>Save JSON</Button>
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() =>
              void reload().catch((cause) => setError(cause.message))
            }
          >
            Reload
          </Button>
        </div>
      </details>
    </form>
  );
}

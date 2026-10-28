"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/console-api";

type Item = { id: string; name: string; kind?: string };
export function Trash({
  kind,
  sessionId,
  onRestore,
}: {
  kind: "projects" | "sessions" | "conversations";
  sessionId?: string;
  onRestore?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string>();
  const [working, setWorking] = useState(false);
  const base =
    kind === "projects"
      ? "/workspaces"
      : kind === "sessions"
        ? "/sessions"
        : `/sessions/${sessionId}/conversations`;
  useEffect(() => {
    const controller = new AbortController();
    api<Item[]>(`${base}/trash`, "GET", undefined, controller.signal)
      .then(setItems)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [base]);
  return (
    <details className="border-t p-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        Deleted {kind} · {items.length}
      </summary>
      <p className="my-3">
        Restore items or delete them permanently. Permanent deletion erases
        saved history; project source files stay on disk. Main and delegated
        history must be erased with their session.
      </p>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <div
          key={item.id}
          className="my-2 flex items-center justify-between gap-3"
        >
          <span>{item.name}</span>
          <div className="flex flex-wrap gap-1">
            <Button
              disabled={working}
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await api(`${base}/${item.id}/restore`, "POST");
                  setItems(await api(`${base}/trash`));
                  onRestore?.();
                } catch (cause) {
                  setError((cause as Error).message);
                }
              }}
            >
              Restore
            </Button>
            {kind === "conversations" &&
            (item.id === "1" || item.kind === "subagent") ? (
              <span className="text-xs">Erase through its session</span>
            ) : confirming !== item.id ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={working}
                onClick={() => setConfirming(item.id)}
              >
                Delete forever
              </Button>
            ) : (
              <div className="space-y-2 border border-destructive p-2">
                <p>
                  This permanently erases {item.name}. It cannot be restored.
                  Continue?
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={working}
                  onClick={async () => {
                    setWorking(true);
                    setError("");
                    try {
                      await api(`${base}/${item.id}/permanent`, "DELETE");
                      setConfirming(undefined);
                      setItems(await api(`${base}/trash`));
                      onRestore?.();
                    } catch (cause) {
                      setError((cause as Error).message);
                    } finally {
                      setWorking(false);
                    }
                  }}
                >
                  Permanently delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={working}
                  onClick={() => setConfirming(undefined)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </details>
  );
}

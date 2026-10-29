"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type Conversation } from "@/lib/api";

export function ConversationRuntime({
  session,
  path,
  disabled,
}: {
  session: Conversation;
  path: string;
  disabled: boolean;
}) {
  const [instructions, setInstructions] = useState("");
  const [handoff, setHandoff] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef<
    { action: string; text: string; requestId: string } | undefined
  >(undefined);
  const usage = session.contextUsage;
  const ledgers = Object.entries(session.usage?.models ?? {});
  const cost = ledgers.reduce((sum, [, item]) => sum + item.cost.total, 0);
  const available = session.contextUsage !== undefined;
  const blocked =
    disabled || working || session.status !== "idle" || !available;

  async function act(action: "compact" | "reset", text: string) {
    if (blocked) return;
    const input =
      attempt.current?.action === action && attempt.current.text === text
        ? attempt.current
        : { action, text, requestId: crypto.randomUUID() };
    attempt.current = input;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await api(`${path}/${action}`, "POST", {
        requestId: input.requestId,
        ...(text
          ? action === "compact"
            ? { instructions: text }
            : { handoff: text }
          : {}),
      });
      attempt.current = undefined;
      setNotice(
        action === "compact"
          ? "Compaction requested. Pi keeps recent context and preserves stored history."
          : "Context reset. Stored history is preserved; your next message starts a new run.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-4 border-t pt-4" aria-label="Context and usage">
      <h3 className="text-sm font-medium">Context and usage</h3>
      {usage && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Estimated context: {usage.estimatedTokens.toLocaleString()} /{" "}
            {usage.capacity.toLocaleString()} tokens
          </p>
          {usage.capacity > 0 && (
            <progress
              aria-label="Estimated context usage"
              className="h-2 w-full"
              max={usage.capacity}
              value={Math.min(usage.estimatedTokens, usage.capacity)}
            />
          )}
          <p>
            Automatic compaction starts around{" "}
            {Math.max(
              0,
              usage.capacity - usage.reserveTokens - usage.backgroundTokens,
            ).toLocaleString()}{" "}
            tokens; generation waits around{" "}
            {Math.max(0, usage.capacity - usage.reserveTokens).toLocaleString()}
            . Pi must have older context available to summarize.
          </p>
          <p>
            The estimate covers saved model context. It can differ from provider
            billing.
          </p>
        </div>
      )}
      {!available && (
        <p role="status" className="text-xs text-muted-foreground">
          Runtime controls are unavailable on this backend. Restart it after
          updating the server.
        </p>
      )}
      {session.usage && (
        <p className="text-xs">Recorded model cost: ${cost.toFixed(6)} USD</p>
      )}
      <p className="text-xs text-muted-foreground">
        Provider/catalog estimates, including compaction. Subscription billing
        can differ. Totals belong to this conversation; fork ancestry is not
        charged again here.
      </p>
      {ledgers.map(([model, item]) => (
        <div key={model} className="space-y-1 border p-2 text-xs">
          <p className="wrap-break-word font-medium">{model}</p>
          <p>
            Input {item.input.toLocaleString()} · Output{" "}
            {item.output.toLocaleString()}
          </p>
          <p>
            Cache read {item.cacheRead.toLocaleString()} · Cache write{" "}
            {item.cacheWrite.toLocaleString()}
          </p>
          {item.reasoning !== undefined && (
            <p>
              Reasoning {item.reasoning.toLocaleString()} (included in output)
            </p>
          )}
        </div>
      ))}
      {(session.compactions ?? []).map((item) => (
        <p key={item.id} role="status" className="text-xs">
          Compacting · {item.reason} · attempt {item.attempt}
          {item.blocking ? " · generation waiting" : ""}
          {item.retryAt ? " · retry scheduled" : ""}
        </p>
      ))}
      {session.compactionFailed && (
        <p role="alert" className="text-xs text-destructive">
          Compaction failed. Check provider access and retry when idle.
        </p>
      )}
      <label className="block space-y-1 text-xs">
        Compaction instructions
        <textarea
          className="w-full border bg-background p-2"
          maxLength={8000}
          rows={2}
          value={instructions}
          disabled={working}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={blocked || !session.model}
        onClick={() => void act("compact", instructions)}
      >
        Compact context
      </Button>
      <label className="block space-y-1 text-xs">
        Handoff note for a new context (optional)
        <textarea
          className="w-full border bg-background p-2"
          maxLength={8000}
          rows={2}
          value={handoff}
          disabled={working}
          onChange={(event) => setHandoff(event.target.value)}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={blocked}
        onClick={() => void act("reset", handoff)}
      >
        Reset context · keep history
      </Button>
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

import type { Execution } from "./conversation-state";
import {
  executionLabel,
  executionNeedsAttention,
  failureLabel,
} from "./execution-labels";

function Time({ at }: { at: number }) {
  return (
    <time dateTime={new Date(at).toISOString()}>
      {new Date(at).toLocaleTimeString()}
    </time>
  );
}

export function ExecutionStatus({
  execution,
  details = false,
}: {
  execution?: Execution;
  details?: boolean;
}) {
  if (!execution || !executionNeedsAttention(execution)) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="space-y-2 text-xs text-muted-foreground"
    >
      {execution.state !== "idle" && (
        <p>
          {executionLabel(execution)}
          {execution.attempt !== undefined
            ? ` · Attempt ${execution.attempt}`
            : ""}
        </p>
      )}
      {execution.state === "retrying" && execution.retryAt !== undefined && (
        <p>
          Retry scheduled for <Time at={execution.retryAt} />.
        </p>
      )}
      {execution.pollAt !== undefined && (
        <p>
          Next provider check: <Time at={execution.pollAt} />.
        </p>
      )}
      {execution.failure && (details || execution.state === "idle") && (
        <p
          className={
            execution.failure.reason === "aborted" ? "" : "text-destructive"
          }
        >
          {details && execution.state !== "idle" ? "Previous run: " : ""}
          {failureLabel(execution.failure.reason)}
        </p>
      )}
      {details &&
        execution.tools.map((tool) => (
          <p key={tool.callId}>
            {tool.name} · {tool.status === "pending" ? "Waiting" : "Running"}
          </p>
        ))}
      {execution.compactions.map((task) => (
        <p key={task.taskId}>
          {task.blocking
            ? "Compacting context"
            : "Compacting context in the background"}
          {task.retryAt !== undefined ? (
            <>
              {" "}
              · Retry at <Time at={task.retryAt} />
            </>
          ) : null}
        </p>
      ))}
      {execution.compactionFailure && (
        <p className="text-destructive">
          The latest context compaction failed.
        </p>
      )}
    </div>
  );
}

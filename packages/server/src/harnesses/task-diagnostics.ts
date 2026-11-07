import type { TaskOutcome } from "@earendil-works/pi-durable";

/** Public explanations deliberately exclude exception messages and task payloads. */
export function taskDiagnostic(outcome: TaskOutcome<unknown> | undefined) {
  if (!outcome || outcome.status === "completed") return undefined;
  if (outcome.status === "aborted")
    return "This task was cancelled. Starting it again creates new work.";
  if (outcome.status === "orphaned")
    return "The saved task definition or migration is unavailable. Restore a compatible backend before starting replacement work.";
  const detail = outcome.error.detail;
  if (
    detail !== null &&
    typeof detail === "object" &&
    !Array.isArray(detail) &&
    detail?.reason === "restart_limit"
  )
    return "Repeated interruptions reached the session restart limit. Check backend stability before starting replacement work; raising the limit does not resume this task.";
  if (outcome.status === "faulted")
    return "The task encountered a runtime fault. Inspect backend diagnostics before starting replacement work; completed side effects may already exist.";
  return "The task reported a failure. Inspect its conversation or tool result before starting replacement work; completed side effects may already exist.";
}

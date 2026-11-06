import type { Execution } from "./conversation-state.ts";

/** Routine work already appears in chat Activity. Surface only waits and exceptional outcomes here. */
export function executionNeedsAttention(execution?: Execution): boolean {
  return (
    !!execution &&
    ((execution.state === "idle" && !!execution.failure) ||
      !!execution.compactionFailure ||
      execution.compactions.length > 0 ||
      execution.state === "retrying" ||
      execution.state === "deferred" ||
      execution.state === "finishing" ||
      execution.state === "compacting")
  );
}

const failures: Record<string, string> = {
  budget_limit: "This session reached its token budget.",
  model_error: "The model request failed after retries.",
  no_model: "The selected model is unavailable. Choose an available model.",
  aborted: "This run was stopped.",
  reset: "This run ended because its context was reset.",
  interrupted: "The backend was interrupted and exhausted its retries.",
  restart_limit: "Repeated backend interruptions reached the restart limit.",
  turn_limit: "This run reached its tool-round limit.",
  nothing_to_answer: "There was no pending input to answer.",
  faulted: "An execution task failed.",
  orphaned: "The backend could not resume an execution task.",
  missing_task: "An execution task is unavailable.",
  task_too_old: "An execution task requires a newer backend.",
  migration_failed: "An execution task could not be migrated.",
  withdrawn: "This input was withdrawn before it ran.",
  run_failed: "This input was not answered because its run failed.",
  stale: "This input was superseded by newer context.",
};
export function failureLabel(reason: string) {
  return Object.hasOwn(failures, reason)
    ? failures[reason]
    : "This run ended without an answer.";
}
export function executionLabel(execution: Execution) {
  switch (execution.state) {
    case "retrying":
      return "Waiting to retry the model request";
    case "tools":
      return "Running tools";
    case "compacting":
      return "Waiting for context compaction";
    case "deferred":
      return "Waiting for the provider response";
    case "running":
      return "Generating a response";
    case "finishing":
      return "Finishing follow-on work";
    default:
      return execution.failure ? "Run ended without an answer" : "Idle";
  }
}

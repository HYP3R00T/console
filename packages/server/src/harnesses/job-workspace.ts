import { defineDoc } from "@earendil-works/pi-durable";

export type JobEnvironment = {
  directory: string;
  worktree: string | null;
  sandbox: boolean;
  remoteProfile: string | null;
  remoteIdentity: string | null;
};
export const JobWorkspace = defineDoc<{ policy?: JobEnvironment }>({
  kind: "console.job-workspace",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({}),
  checkpointWhen: () => false,
});
export function assertJobEnvironment(
  saved: JobEnvironment,
  current: JobEnvironment,
) {
  if (
    saved.directory !== current.directory ||
    saved.worktree !== current.worktree ||
    saved.sandbox !== current.sandbox ||
    saved.remoteProfile !== current.remoteProfile ||
    saved.remoteIdentity !== current.remoteIdentity
  )
    throw new Error(
      "The job's execution workspace policy changed. Schedule a new job with the intended settings.",
    );
}

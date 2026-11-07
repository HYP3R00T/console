import {
  defineExtension,
  defineTask,
  type TaskId,
} from "@earendil-works/pi-durable";
import { BackgroundJob, type BackgroundJobInput } from "./background-job.ts";

export type JobRecurrence = { intervalMs: number; occurrences: number };

/** Fixed-delay recurrence: one owned job at a time, no missed-run catch-up. */
export const RecurringJob = defineTask<
  { job: BackgroundJobInput; recurrence: JobRecurrence },
  | { phase: "schedule"; at: number; completed: number }
  | { phase: "wait"; child: number; completed: number },
  { completed: number; succeeded: boolean }
>({
  name: "console.recurring-job",
  version: 1,
  initial: (input) => ({
    phase: "schedule",
    at: input.job.at,
    completed: 0,
  }),
  phases: {
    async schedule(task, runtime, context) {
      if (task.state.checkpoint.at > runtime.now()) {
        await runtime.sleepUntil(
          task.state.checkpoint.at,
          task.state.checkpoint,
          context,
        );
        return;
      }
      await runtime.commit(async (tx) => {
        const child = await tx.createTask(
          BackgroundJob,
          { ...task.input.job, at: runtime.now() },
          {
            ownership: { kind: "task", taskId: task.id },
          },
        );
        return {
          status: "running",
          checkpoint: {
            phase: "wait",
            child,
            completed: task.state.checkpoint.completed,
          },
        };
      }, context);
    },
    async wait(task, runtime, context) {
      const child = await runtime.waitForTask(
        task.state.checkpoint.child as TaskId<boolean>,
        context,
      );
      const succeeded =
        child.state.outcome?.status === "completed" &&
        child.state.outcome.result === true;
      const completed = task.state.checkpoint.completed + 1;
      await runtime.commit(() => {
        if (!succeeded)
          return {
            status: "terminal",
            outcome: {
              status: "failed",
              error: {
                message:
                  "A recurring job did not complete successfully; remaining occurrences were cancelled.",
              },
              result: { completed, succeeded },
            },
          };
        if (completed >= task.input.recurrence.occurrences)
          return {
            status: "terminal",
            outcome: { status: "completed", result: { completed, succeeded } },
          };
        return {
          status: "running",
          checkpoint: {
            phase: "schedule",
            completed,
            at: runtime.now() + task.input.recurrence.intervalMs,
          },
        };
      }, context);
    },
  },
  abort: (_task, runtime, context) =>
    runtime.commit(
      () => ({ status: "terminal", outcome: { status: "aborted" } }),
      context,
    ),
});

export const RecurringJobExtension = defineExtension({
  name: "console.recurring-jobs",
  tasks: [RecurringJob],
});

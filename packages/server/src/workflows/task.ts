import { createHash } from "node:crypto";
import type {
  WorkflowDefinition,
  WorkflowRunView,
  WorkflowStep,
} from "@console/contracts";
import { copyJson } from "@earendil-works/chord";
import {
  defineDocFamily,
  defineExtension,
  defineTask,
  type TaskId,
} from "@earendil-works/pi-durable";
import {
  BackgroundJob,
  BackgroundJobEntry,
  type BackgroundJobInput,
} from "../harnesses/background-job.ts";

export const WorkflowRuns = defineDocFamily<
  {
    outputs: Record<string, string>;
    decisions?: WorkflowRunView["decisions"];
    approval?: WorkflowRunView["approval"];
    error?: string;
  },
  null
>({
  kind: "console.workflow-run",
  version: 1,
  family: true,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ outputs: {} }),
  checkpointWhen: () => true,
});

export type WorkflowInput = {
  runKey: string;
  workflowId: string;
  version: number;
  definition: WorkflowDefinition;
  input: Record<string, string>;
  job: BackgroundJobInput;
};
type State =
  | { phase: "step"; step: string | null }
  | { phase: "worker"; step: string; child: number };

export function interpolate(
  text: string,
  input: Record<string, string>,
  outputs: Record<string, string>,
) {
  return text.replace(
    /\{\{(input|steps)\.([a-zA-Z0-9_-]+)\}\}/g,
    (_match, kind: string, name: string) => {
      const values = kind === "input" ? input : outputs;
      const value = values[name];
      if (!Object.hasOwn(values, name) || value === undefined)
        throw new Error(`Missing workflow value ${kind}.${name}.`);
      return value;
    },
  );
}

export function approvalRevision(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const WorkflowRun = defineTask<WorkflowInput, State, boolean>({
  name: "console.workflow",
  version: 1,
  initial: (input) => ({
    phase: "step",
    step: input.definition.steps[0]?.id ?? null,
  }),
  phases: {
    async step(task, runtime, context) {
      const step = task.input.definition.steps.find(
        (s) => s.id === task.state.checkpoint.step,
      );
      if (!step) {
        await runtime.commit(
          () => ({
            status: "terminal",
            outcome: { status: "completed", result: true },
          }),
          context,
        );
        return;
      }
      await runtime.commit(async (tx) => {
        const run = await tx.doc(
          WorkflowRuns,
          runtime.conversationId,
          String(task.id),
          null,
        );
        if (step.type === "agent") {
          const child = await tx.createTask(
            BackgroundJob,
            {
              ...task.input.job,
              at: runtime.now(),
              delivery: "display" as const,
              content: interpolate(
                step.instructions,
                task.input.input,
                run.outputs,
              ),
            },
            { ownership: { kind: "task", taskId: task.id } },
          );
          return {
            status: "waiting",
            on: [child],
            policy: "allSettled",
            checkpoint: { phase: "worker", step: step.id, child },
          };
        }
        if (step.type === "condition") {
          if (run.outputs[step.source] === undefined)
            throw new Error(
              `Condition source ${step.source} has no output on this branch.`,
            );
          return {
            status: "running",
            checkpoint: {
              phase: "step",
              step: run.outputs[step.source].includes(step.contains)
                ? step.yes
                : step.no,
            },
          };
        }
        const resolve = (text: string) =>
          interpolate(text, task.input.input, run.outputs);
        const action: WorkflowStep & { type: "approval" } = {
          ...step,
          message: resolve(step.message),
          ...(step.merge && {
            merge: {
              ...step.merge,
              owner: resolve(step.merge.owner),
              repository: resolve(step.merge.repository),
              number: resolve(step.merge.number),
              sha: resolve(step.merge.sha),
            },
          }),
        };
        const revision = approvalRevision({
          runKey: task.input.runKey,
          taskId: task.id,
          version: task.input.version,
          action,
          outputs: run.outputs,
        });
        if (run.approval?.action?.id !== step.id)
          run.approval = { revision, message: action.message, action };
        if (run.approval.decision === "rejected")
          return { status: "terminal", outcome: { status: "aborted" } };
        if (run.approval.decision === "approved" && !action.merge) {
          delete run.approval;
          return {
            status: "running",
            checkpoint: { phase: "step", step: step.next },
          };
        }
        return {
          status: "sleeping",
          until: runtime.now() + 1000,
          checkpoint: task.state.checkpoint,
        };
      }, context);
    },
    async worker(task, runtime, context) {
      const child = await runtime.getTask(
        task.state.checkpoint.child as TaskId<boolean>,
        context,
      );
      await runtime.commit(async (tx) => {
        const run = await tx.doc(
          WorkflowRuns,
          runtime.conversationId,
          String(task.id),
          null,
        );
        if (
          child?.state.status !== "terminal" ||
          child.state.outcome.status !== "completed" ||
          child.state.outcome.result !== true
        ) {
          run.error = `Step ${task.state.checkpoint.step} failed. Inspect its job receipt before starting another run.`;
          return {
            status: "terminal",
            outcome: { status: "completed", result: false },
          };
        }
        let cursor: Awaited<ReturnType<typeof tx.scanEntries>>["next"];
        do {
          const page = await tx.scanEntries(
            { conversationId: runtime.conversationId, order: "descending" },
            100,
            cursor,
          );
          const result = page.items.find(
            (entry) =>
              BackgroundJobEntry.is(entry) && entry.data.taskId === child.id,
          );
          if (result && BackgroundJobEntry.is(result)) {
            run.outputs[task.state.checkpoint.step] = result.data.text;
            break;
          }
          cursor = page.next;
        } while (cursor);
        const step = task.input.definition.steps.find(
          (s) => s.id === task.state.checkpoint.step,
        );
        if (step?.type !== "agent")
          throw new Error("Workflow step definition is unavailable.");
        return {
          status: "running",
          checkpoint: { phase: "step", step: step.next },
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

export function createWorkflowExtension(
  merge: (
    action: NonNullable<Extract<WorkflowStep, { type: "approval" }>["merge"]>,
    signal?: AbortSignal,
  ) => Promise<void>,
) {
  const task = defineTask({
    ...WorkflowRun.definition,
    phases: {
      ...WorkflowRun.definition.phases,
      async step(task, runtime, context) {
        // Read through a commit, then perform the SHA-conditional external operation.
        let approval: WorkflowRunView["approval"];
        await runtime.commit(async (tx) => {
          const current = (
            await tx.doc(
              WorkflowRuns,
              runtime.conversationId,
              String(task.id),
              null,
            )
          ).approval;
          approval = current
            ? (copyJson(current) as WorkflowRunView["approval"])
            : undefined;
        }, context);
        if (approval?.decision === "approved" && approval.action?.merge) {
          try {
            await merge(approval.action.merge, context.abortSignal);
          } catch (error) {
            context.abortSignal?.throwIfAborted();
            await runtime.commit(async (tx) => {
              const run = await tx.doc(
                WorkflowRuns,
                runtime.conversationId,
                String(task.id),
                null,
              );
              if (run.approval) {
                delete run.approval.decision;
                run.approval.invalidated =
                  error instanceof Error
                    ? error.message
                    : "Merge could not be verified.";
                run.approval.revision = approvalRevision({
                  previous: run.approval.revision,
                  invalidatedAt: runtime.now(),
                });
              }
              return {
                status: "sleeping",
                until: runtime.now() + 1000,
                checkpoint: task.state.checkpoint,
              };
            }, context);
            return;
          }
          await runtime.commit(async (tx) => {
            const run = await tx.doc(
              WorkflowRuns,
              runtime.conversationId,
              String(task.id),
              null,
            );
            run.outputs[approval?.action?.id ?? "merge"] =
              "Merged approved pull request.";
            delete run.approval;
            return {
              status: "running",
              checkpoint: {
                phase: "step",
                step: approval?.action?.next ?? null,
              },
            };
          }, context);
          return;
        }
        await WorkflowRun.definition.phases.step(task, runtime, context);
      },
    },
  });
  return defineExtension({ name: "console.workflows", tasks: [task] });
}

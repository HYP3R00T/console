import {
  defineDoc,
  defineEntry,
  defineExtension,
  defineTask,
  GenerationTask,
  hook,
  runEndTask,
  ToolResultEntry,
} from "@earendil-works/pi-durable";
import { codeModeCalls } from "./advanced-tools.ts";

export const PostRunDoc = defineDoc<{ command?: string }>({
  kind: "console.post-run",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({}),
  checkpointWhen: () => true,
});

type CheckResult = {
  status: "passed" | "failed" | "cancelled" | "interrupted";
  output: string;
};
export const PostRunEntry = defineEntry<CheckResult>("console.post-run-check");

const CheckTask = defineTask<
  { command: string },
  { phase: "run" },
  CheckResult["status"]
>({
  name: "console.post-run-check",
  version: 1,
  initial: () => ({ phase: "run" }),
  phases: {
    async run(task, runtime, context) {
      let result: CheckResult;
      if (await runtime.memo<boolean>("launched", context)) {
        result = {
          status: "interrupted",
          output:
            "The previous check may have started before the backend stopped.",
        };
      } else {
        const env = await runtime.env(context);
        if (!env) throw new Error("Workspace is unavailable.");
        await runtime.memo("launched", true, context);
        let output = "";
        const executed = await env.exec(
          task.input.command,
          {
            timeout: 120,
            onOutput: (chunk) => {
              output = (output + chunk).slice(-4000);
            },
          },
          context,
        );
        context.abortSignal?.throwIfAborted();
        const summary = executed.ok
          ? `Exit code ${executed.value.exitCode}.`
          : `Check could not finish (${executed.error.code}).`;
        result = {
          status:
            executed.ok && executed.value.exitCode === 0 ? "passed" : "failed",
          output: output.trim() ? `${summary}\n${output.trim()}` : summary,
        };
      }
      await runtime.commit(async (tx) => {
        await tx.appendEntry(PostRunEntry, runtime.conversationId, {
          data: result,
        });
        return {
          status: "terminal",
          outcome: { status: "completed", result: result.status },
        };
      }, context);
    },
  },
  async abort(_task, runtime, context) {
    await runtime.commit(async (tx) => {
      await tx.appendEntry(PostRunEntry, runtime.conversationId, {
        data: { status: "cancelled", output: "The check was stopped." },
      });
      return { status: "terminal", outcome: { status: "aborted" } };
    }, context);
  },
});

export const PostRunExtension = defineExtension({
  name: "console.post-run",
  tasks: [CheckTask],
  hooks: [
    hook(GenerationTask, {
      async afterRun(run, api, context) {
        const command = (
          await api.snapshot(PostRunDoc, api.conversationId, context)
        )?.command;
        if (!command) return;
        const range = { minEntryId: run.first, maxEntryId: run.last };
        let cursor: Awaited<ReturnType<typeof api.entries>>["next"];
        do {
          const page = await api.entries(range, 100, cursor, context);
          if (
            page.items.some(
              (entry) =>
                entry.conversationId === api.conversationId &&
                ToolResultEntry.is(entry) &&
                entry.model?.some(
                  (message) =>
                    message.role === "toolResult" &&
                    ((!message.isError &&
                      (message.toolName === "write" ||
                        message.toolName === "edit")) ||
                      (message.toolName === "codemode" &&
                        codeModeCalls(message.details).some(
                          (call) =>
                            call.status === "ok" &&
                            (call.name === "write" || call.name === "edit"),
                        ))),
                ),
            )
          )
            return { tasks: [runEndTask(CheckTask, { command })] };
          cursor = page.next;
        } while (cursor);
      },
    }),
  ],
});

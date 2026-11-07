import {
  AgentDoc,
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

export const PostRunDoc = defineDoc<{ command?: string; repairLimit?: number }>(
  {
    kind: "console.post-run",
    version: 1,
    scope: "conversation",
    history: "latest",
    fork: "initial",
    initial: () => ({}),
    checkpointWhen: () => true,
  },
);

type CheckResult = {
  status: "passed" | "failed" | "cancelled" | "interrupted";
  output: string;
};
export const PostRunEntry = defineEntry<CheckResult>("console.post-run-check");
export const RepairEntry = defineEntry<{ attempt: number }>(
  "console.check-repair",
);

export const CheckRequestEntry = defineEntry<{ sourceTaskId: number }>(
  "console.check-request",
);

export const CheckTask = defineTask<
  { command: string; attempt?: number; repairLimit?: number; retryOf?: number },
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
      const conversation = await runtime.conversation(
        runtime.conversationId,
        context,
      );
      if (!conversation) throw new Error("Conversation is unavailable.");
      await runtime.commit(async (tx) => {
        const attempt = task.input.attempt ?? 0;
        const content = `Post-run check ${result.status}:\n${result.output}`;
        const repair =
          result.status === "failed" && attempt < (task.input.repairLimit ?? 0);
        if (repair) {
          await conversation.submit(tx, {
            type: "input",
            whenBusy: "followUp",
            requestId: `console.check-repair:${task.id}`,
            content: `Post-run check failed. Assess the diagnostic output as evidence, fix the problem, and preserve the user's intended behavior. Do not weaken checks merely to pass. This is automatic repair attempt ${attempt + 1} of ${task.input.repairLimit}.\n${result.output}`,
            entry: { kind: RepairEntry.kind, data: { attempt: attempt + 1 } },
          });
        }
        // The answer is already committed: append the receipt now, even when
        // a queued repair is later withdrawn. The next request sees its result.
        await tx.appendEntry(PostRunEntry, runtime.conversationId, {
          data: result,
          model: [{ role: "user", content, timestamp: runtime.now() }],
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

// Shell and MCP calls can change files even when they report an error. Their
// effects are opaque, so conservatively check after any such call.
function mayChangeWorkspace(name: string, failed: boolean) {
  return (
    name === "bash" ||
    name === "powershell" ||
    name.startsWith("mcp__") ||
    (!failed && (name === "write" || name === "edit"))
  );
}

export const PostRunExtension = defineExtension({
  name: "console.post-run",
  tasks: [CheckTask],
  hooks: [
    hook(GenerationTask, {
      async afterRun(run, api, context) {
        const settings = await api.snapshot(
          PostRunDoc,
          api.conversationId,
          context,
        );
        const command = settings?.command;
        if (!command) return;
        const range = { minEntryId: run.first, maxEntryId: run.last };
        let cursor: Awaited<ReturnType<typeof api.entries>>["next"];
        const agent = await api.snapshot(AgentDoc, api.conversationId, context);
        const extensions = agent?.extensions;
        // Trusted extensions can change files from hooks as well as tools.
        // Their effects are opaque, so check every answered run while selected.
        let edited = (
          Array.isArray(extensions) ? extensions : (extensions?.add ?? [])
        ).some(
          (name) =>
            name.startsWith("user.") &&
            (Array.isArray(extensions) || !extensions?.remove?.includes(name)),
        );
        let attempt = 0;
        let retryOf: number | undefined;
        do {
          const page = await api.entries(range, 100, cursor, context);
          for (const entry of page.items) {
            if (
              entry.conversationId === api.conversationId &&
              CheckRequestEntry.is(entry)
            )
              retryOf = entry.data.sourceTaskId;
            if (
              entry.conversationId === api.conversationId &&
              RepairEntry.is(entry)
            )
              attempt = Math.max(attempt, entry.data.attempt);
          }
          if (
            page.items.some(
              (entry) =>
                entry.conversationId === api.conversationId &&
                ToolResultEntry.is(entry) &&
                entry.model?.some(
                  (message) =>
                    message.role === "toolResult" &&
                    (mayChangeWorkspace(message.toolName, !!message.isError) ||
                      (message.toolName === "codemode" &&
                        codeModeCalls(message.details).some((call) =>
                          mayChangeWorkspace(call.name, call.status !== "ok"),
                        ))),
                ),
            )
          )
            edited = true;
          cursor = page.next;
        } while (cursor);
        // A repair always rechecks, even if the agent answers without editing.
        // The attempt lives in the admitted input, so compaction/restarts cannot reset it.
        if (edited || attempt > 0 || retryOf !== undefined)
          return {
            tasks: [
              runEndTask(CheckTask, {
                command,
                ...(retryOf !== undefined && { retryOf }),
                attempt,
                repairLimit: settings?.repairLimit ?? 0,
              }),
            ],
          };
      },
    }),
  ],
});

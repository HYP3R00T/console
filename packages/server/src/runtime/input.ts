import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  AgentDoc,
  CompactionTask,
  LiveDoc,
  type Conversation as PiConversation,
  ResetEntry,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { httpError } from "../http/errors.ts";
import { expandPrompt, loadProjectResource } from "../projects/resources.ts";

import type { Runtime } from "./context.ts";
import { assertIdle as requireIdle } from "./context.ts";
import { CompactionReceipts } from "./documents.ts";
import { conversationSummary } from "./view.ts";
export function conversationInput(runtime: Runtime, root: PiConversation) {
  const { models, storage, harness, serialize } = runtime;
  const assertIdle = () => requireIdle(runtime, root);
  const summary = () => conversationSummary(runtime, root);
  return {
    submit(input: {
      text: string;
      requestId: string;
      whenBusy?: "reject" | "steer" | "followUp";
    }) {
      return serialize(async () => {
        const duplicate = await storage.submissionByRequest(
          root.id,
          input.requestId,
          context,
        );
        if (duplicate) return { id: String(duplicate.id) };
        if (!input.text.trim())
          throw httpError(400, "Message must not be blank.");
        if (!input.whenBusy || input.whenBusy === "reject") await assertIdle();
        const inspection = await harness.inspect(context);
        if (inspection.scheduling === "paused" && inspection.tasks.length)
          throw httpError(
            409,
            "Resume or cancel interrupted work in this session before submitting new work.",
          );
        const agent = await summary();
        if (
          !agent.model ||
          !models.getModel(agent.model.provider, agent.model.modelId)
        )
          throw httpError(400, "Choose a model in session settings first.");
        if (!(await models.checkAuth(agent.model.provider)))
          throw httpError(400, "Configure this provider first.");
        await root.configure({ thinkingLevel: agent.thinkingLevel }, context);
        let content = input.text;
        const command =
          /^\/(skill|prompt):([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(content);
        if (command) {
          const kind = command[1] as "skill" | "prompt";
          let resource: { path: string; content: string };
          try {
            const cwd = (await root.agent(context)).cwd;
            if (!cwd) throw new Error("No project directory");
            resource = loadProjectResource(cwd, kind, command[2]);
          } catch {
            throw httpError(
              400,
              "Project resource could not be loaded. Reload the resources and check its name and project directory.",
            );
          }
          try {
            content =
              kind === "prompt"
                ? expandPrompt(resource.content, command[3] ?? "")
                : `Use the following project skill from ${resource.path}. Supporting file paths are relative to its directory.\n\n${resource.content}\n\nUser request: ${command[3] ?? ""}`;
          } catch {
            throw httpError(400, "Template arguments contain invalid quoting.");
          }
          if (!content.trim())
            throw httpError(400, "Expanded project prompt is blank.");
          if (content.length > 64000)
            throw httpError(
              400,
              "Expanded project prompt exceeds 64,000 characters.",
            );
        }
        const submission = await root.submit(
          {
            type: "input",
            content,
            requestId: input.requestId,
            whenBusy: input.whenBusy ?? "reject",
          },
          context,
        );
        return { id: String(submission.id) };
      });
    },
    withdraw(id: string) {
      return serialize(async () => {
        if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
          throw httpError(400, "Invalid submission ID.");
        const record = await storage.submission(
          Number(id) as SubmissionId,
          context,
        );
        if (
          !record ||
          record.conversationId !== root.id ||
          record.type !== "input"
        )
          throw httpError(404, "Submission not found in this conversation.");
        const submission = await harness.submission(record.id, context);
        if (!submission) throw httpError(404, "Submission not found.");
        const result = await submission.abort(context);
        if (result === "already_placed")
          throw httpError(
            409,
            "This message is already part of the run; stop the run to cancel it.",
          );
      });
    },
    compact(input: { requestId: string; instructions?: string }) {
      return serialize(async () => {
        const receipts = await harness.snapshot(
          CompactionReceipts,
          root.id,
          context,
        );
        const receiptKey = `request:${input.requestId}`;
        if (receipts?.requests[receiptKey])
          return { id: receipts.requests[receiptKey] };
        await assertIdle();
        const inspection = await harness.inspect(context);
        if (inspection.scheduling === "paused" && inspection.tasks.length)
          throw httpError(
            409,
            "Resume or cancel interrupted work before compacting.",
          );
        const agent = await root.agent(context);
        if (!agent.model || !(await models.checkAuth(agent.model.provider)))
          throw httpError(
            400,
            "Connect a provider and choose a model before compacting.",
          );
        const id = await root.commit(async (tx) => {
          const saved = await tx.doc(CompactionReceipts, root.id);
          const task = await tx.createTask(
            CompactionTask,
            {
              reason: "manual" as const,
              ...(input.instructions
                ? { instructions: input.instructions }
                : {}),
            },
            { ownership: { kind: "conversation" }, conversationId: root.id },
          );
          const live = await tx.doc(LiveDoc, root.id);
          live.compactions ??= [];
          live.compactions.push({
            taskId: task,
            reason: "manual",
            blocking: false,
            attempt: 1,
          });
          saved.requests[receiptKey] = String(task);
          return String(task);
        }, context);
        harness.resume();
        return { id };
      });
    },
    reset(input: { requestId: string; handoff?: string }) {
      return serialize(async () => {
        const duplicate = await storage.submissionByRequest(
          root.id,
          input.requestId,
          context,
        );
        if (duplicate) return { id: String(duplicate.id) };
        await assertIdle();
        const inspection = await harness.inspect(context);
        if (inspection.scheduling === "paused" && inspection.tasks.length)
          throw httpError(
            409,
            "Resume or cancel interrupted work before resetting context.",
          );
        const submission = await root.submit(
          {
            type: "write",
            requestId: input.requestId,
            entry: {
              kind: ResetEntry.kind,
              head: "self",
              ...(input.handoff
                ? {
                    model: [
                      {
                        role: "user",
                        content: input.handoff,
                        timestamp: Date.now(),
                      },
                    ],
                  }
                : {}),
            },
          },
          context,
        );
        return { id: String(submission.id) };
      });
    },
    cancel: () => serialize(() => root.abort(context)),
    resume: () =>
      serialize(async () => {
        const agent = await harness.snapshot(AgentDoc, root.id, context);
        if (!agent?.model || !(await models.checkAuth(agent.model.provider)))
          throw httpError(
            400,
            "Configure the conversation's provider before resuming.",
          );
        harness.resume();
      }),
  };
}

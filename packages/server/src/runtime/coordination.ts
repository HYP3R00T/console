import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Type } from "@earendil-works/pi-ai";
import {
  AgentDoc,
  AssistantEntry,
  configure,
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import { httpError } from "../http/errors.ts";
import { updatePlan } from "./plan.ts";

// One machine-wide document. Revision checks and durable tool receipts prevent lost updates/replays.
export function openAgentState(directory: string) {
  const db = new DatabaseSync(join(directory, "agent-state.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, value TEXT NOT NULL); INSERT OR IGNORE INTO state VALUES (1,0,'{}'); CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, result TEXT NOT NULL)",
  );
  function get() {
    const row = db.prepare("SELECT revision,value FROM state WHERE id=1").get();
    if (!row) throw new Error("Missing shared state");
    return {
      revision: Number(row.revision),
      value: JSON.parse(String(row.value)) as Record<string, unknown>,
    };
  }
  function save(
    value: Record<string, unknown>,
    revision: number,
    receipt?: string,
  ) {
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !== "object" ||
      JSON.stringify(value).length > 65536
    )
      throw httpError(400, "State must be a JSON object up to 64 KiB.");
    db.exec("BEGIN IMMEDIATE");
    try {
      const prior = receipt
        ? db.prepare("SELECT result FROM receipts WHERE id=?").get(receipt)
        : undefined;
      if (prior) {
        db.exec("COMMIT");
        return JSON.parse(String(prior.result)) as ReturnType<typeof get>;
      }
      if (get().revision !== revision)
        throw httpError(409, "State changed. Reload it before saving.");
      db.prepare("UPDATE state SET revision=revision+1,value=? WHERE id=1").run(
        JSON.stringify(value),
      );
      const result = get();
      if (receipt)
        db.prepare("INSERT INTO receipts VALUES (?,?)").run(
          receipt,
          JSON.stringify(result),
        );
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return { get, save, close: () => db.close() };
}

export function agentExtension(
  state: ReturnType<typeof openAgentState>,
  sessionId: string,
) {
  const read = defineTool({
    name: "read_state",
    description:
      "Read machine-wide shared JSON state and its revision. Shared across projects, sessions and conversations. Never store credentials here.",
    parameters: Type.Object({}, { additionalProperties: false }),
    replay: "safe",
    execute: async () => ({
      output: [{ type: "text", text: JSON.stringify(state.get()) }],
    }),
  });
  const update = defineTool({
    name: "update_state",
    description:
      "Replace shared state using the revision returned by read_state. Preserve unrelated fields. A stale revision is rejected; read again before retrying.",
    parameters: Type.Object(
      {
        value_json: Type.String({ maxLength: 65536 }),
        revision: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    replay: "safe",
    execute: async (args, api) => ({
      output: [
        {
          type: "text",
          text: JSON.stringify(
            state.save(
              JSON.parse(args.value_json),
              args.revision,
              `${sessionId}:${api.taskId}`,
            ),
          ),
        },
      ],
    }),
  });
  const child = defineTool({
    name: "subagent",
    description:
      "Delegate a bounded task to a child conversation only when asked to delegate. Inherits current model and working directory. Cannot recursively delegate. Parent cancellation also stops the child.",
    parameters: Type.Object(
      { task: Type.String({ minLength: 1, maxLength: 16000 }) },
      { additionalProperties: false },
    ),
    replay: "safe",
    execute: async (args, api, context) => {
      const resolved = await api.agent(context);
      const selected = new Set(resolved.tools.map((tool) => tool.name));
      const id = await api.commit(async (tx) => {
        const existing = (
          await tx.scanConversations({ ownerTaskId: api.taskId }, 1)
        ).items[0];
        if (existing) return existing.id;
        const agent = await tx.doc(AgentDoc, api.conversationId);
        const created = await tx.createConversation({
          ownership: { kind: "task", taskId: api.taskId },
        });
        await configure(tx, created.id, {
          // Pi copies the parent AgentDoc; narrow only the child's tools.
          tools: Array.isArray(agent.tools)
            ? api.registry
                .tools()
                .filter(
                  ({ tool }) =>
                    selected.has(tool.name) && tool.name !== "subagent",
                )
                .map(({ tool }) => tool)
            : [],
        });
        return created.id;
      }, context);
      await api.details({ conversationId: id }, context);
      const handle = await api.conversation(id, context);
      if (!handle) throw new Error("Child conversation missing");
      const result = await (
        await handle.submit(
          {
            type: "input",
            content: args.task,
            requestId: `child:${api.taskId}`,
          },
          context,
        )
      ).wait(context);
      const answer =
        result.status === "done" && result.type === "input"
          ? await api.commit(
              (tx) => tx.entry(AssistantEntry, result.answer),
              context,
            )
          : undefined;
      return {
        output: [
          { type: "text", text: JSON.stringify(answer?.model ?? result) },
        ],
      };
    },
  });
  return defineExtension({
    name: "console.agent",
    tools: [read, update, child, updatePlan],
    sections: [
      section(
        "coordination",
        async () =>
          "Shared state belongs to this machine, not just this project. Read before writing, preserve unrelated fields, and never store secrets. For multi-step work, use update_plan when available to record a short plan and keep actual statuses current. Simple questions do not need a plan. Delegate only when requested. Child conversations share the project files and the host execution environment; they are not separate checkouts.",
      ),
    ],
  });
}

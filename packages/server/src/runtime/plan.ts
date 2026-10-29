import { Type } from "@earendil-works/pi-ai";
import { defineDoc, defineTool } from "@earendil-works/pi-durable";

export type PlanState = {
  title: string;
  steps: { step: string; status: "pending" | "in_progress" | "completed" }[];
  sourceEntryId: string;
};

export const PlanDoc = defineDoc<PlanState>({
  kind: "console.plan",
  version: 1,
  scope: "conversation",
  history: "rewindable",
  fork: "asOf",
  initial: () => ({ title: "Plan", steps: [], sourceEntryId: "" }),
  checkpointWhen: () => true,
});

export const updatePlan = defineTool({
  name: "update_plan",
  description:
    "Record a short plan for multi-step work and keep its actual step statuses current. At most one step may be in progress. Report completed steps only after doing the work. An empty steps list clears the plan.",
  parameters: Type.Object(
    {
      title: Type.String({ minLength: 1, maxLength: 200 }),
      steps: Type.Array(
        Type.Object(
          {
            step: Type.String({ minLength: 1, maxLength: 500 }),
            status: Type.Union([
              Type.Literal("pending"),
              Type.Literal("in_progress"),
              Type.Literal("completed"),
            ]),
          },
          { additionalProperties: false },
        ),
        { maxItems: 30 },
      ),
    },
    { additionalProperties: false },
  ),
  replay: "safe",
  async execute(args, api, context) {
    if (args.steps.filter((step) => step.status === "in_progress").length > 1)
      throw new Error("A plan can have at most one step in progress");
    if (new Set(args.steps.map((step) => step.step)).size !== args.steps.length)
      throw new Error("Plan steps must have distinct descriptions");
    const plan = await api.commit(async (tx) => {
      const latest = await tx.scanEntries(
        { conversationId: api.conversationId, order: "descending" },
        1,
      );
      const saved = await tx.doc(PlanDoc, api.conversationId);
      Object.assign(saved, {
        title: args.title,
        steps: args.steps,
        sourceEntryId: String(latest.items[0]?.id ?? ""),
      });
      return {
        title: args.title,
        steps: args.steps,
        sourceEntryId: saved.sourceEntryId,
      };
    }, context);
    return { output: [{ type: "text", text: JSON.stringify(plan) }] };
  },
});

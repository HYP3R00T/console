import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import type {
  Conversation,
  createRegistry,
  Harness,
} from "@earendil-works/pi-durable";
import type { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { httpError } from "../http/errors.ts";
import type { agentExtension } from "./coordination.ts";

// One session owns these resources and this mutation queue; bound conversations share them.
export type Runtime = {
  models: Models;
  storage: Awaited<ReturnType<typeof openNodeSqliteStorage>>;
  harness: Harness;
  registry: ReturnType<typeof createRegistry>;
  coordination: ReturnType<typeof agentExtension> | undefined;
  serialize: <T>(operation: () => Promise<T>) => Promise<T>;
};
export type RuntimeInspection = Awaited<ReturnType<Harness["inspect"]>>;
export async function assertIdle({ harness }: Runtime, root: Conversation) {
  if (
    (await harness.inspect(context)).tasks.some(
      (task) => task.record.conversationId === root.id,
    )
  )
    throw httpError(
      409,
      "Cancel or finish the current work before changing settings or sending another message.",
    );
}

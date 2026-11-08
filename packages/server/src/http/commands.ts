import type {
  CommandCatalog,
  CommandDescriptor,
  Scope,
} from "@console/contracts";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyContextConfig {
    consoleCommand?: { id: string; scope: Exclude<Scope, "client"> };
  }
}
export function registerCommandCatalog(app: FastifyInstance) {
  const commands = new Map<string, CommandDescriptor>();
  app.addHook("onRoute", (route) => {
    const command = route.config?.consoleCommand;
    if (!command) return;
    if (commands.has(command.id))
      throw new Error(`Duplicate command ID: ${command.id}`);
    commands.set(command.id, {
      ...command,
      method: String(route.method),
      path: route.url,
      inputSchema: (route.schema?.body ?? {}) as Record<string, unknown>,
    });
  });
  app.get("/v1/commands", (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      version: 1,
      commands: [...commands.values()],
    } satisfies CommandCatalog;
  });
}

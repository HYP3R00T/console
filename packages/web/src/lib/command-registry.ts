import type { CommandId } from "./commands.ts";
export type CommandHandler = {
  run: (input?: unknown) => unknown;
  disabled?: string;
};
export type RegisteredCommands = Partial<Record<CommandId, CommandHandler>>;
/** Entries are route-scoped; disposal cannot remove a newer registration. */
export class CommandRegistry {
  private entries = new Map<
    symbol,
    { route: string; commands: RegisteredCommands }
  >();
  private listeners = new Set<() => void>();
  private version = 0;
  snapshot = () => this.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  register(route: string, commands: RegisteredCommands) {
    const token = Symbol();
    this.entries.set(token, { route, commands });
    this.changed();
    return () => {
      this.entries.delete(token);
      this.changed();
    };
  }
  get(id: CommandId, route: string) {
    let handler: CommandHandler | undefined;
    for (const entry of this.entries.values())
      if (entry.route === route && entry.commands[id])
        handler = entry.commands[id];
    return handler;
  }
  invoke(id: CommandId, route: string, input?: unknown) {
    const handler = this.get(id, route);
    if (!handler)
      throw new Error("This command is unavailable in the current context.");
    if (handler.disabled) throw new Error(handler.disabled);
    return handler.run(input);
  }
}
export const slashCommands = {
  "/stop": "conversation.stop",
  "/continue": "conversation.continue",
  "/compact": "conversation.compact",
  "/settings": "settings.open",
} as const satisfies Record<string, CommandId>;
export function slashSuggestions(content: string, composing: boolean) {
  return composing || !/^\/[a-z]*$/.test(content)
    ? []
    : Object.entries(slashCommands).filter(([name]) =>
        name.startsWith(content),
      );
}

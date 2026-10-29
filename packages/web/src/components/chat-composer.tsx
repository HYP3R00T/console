"use client";

import {
  ArrowUpIcon,
  CheckIcon,
  CornerDownRightIcon,
  HandIcon,
  ListPlusIcon,
  SquareIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MessageMode } from "@/lib/console-api";

export function ChatComposer({
  text,
  disabled,
  sending,
  busy,
  canCancel,
  uncertain,
  hint,
  modelPicker,
  onText,
  onSend,
  onCancel,
  onCommand,
  mode,
  onMode,
  modesAvailable,
}: {
  text: string;
  disabled: boolean;
  sending: boolean;
  busy: boolean;
  canCancel: boolean;
  uncertain: boolean;
  hint: string;
  modelPicker: ReactNode;
  onText: (text: string) => void;
  onSend: (mode?: MessageMode) => void;
  onCancel: () => void;
  onCommand: (command: string) => void;
  mode: MessageMode;
  onMode: (mode: MessageMode) => void;
  modesAvailable: boolean;
}) {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const commands = [
    ["config", "Model, thinking, and sandbox"],
    ["state", "Machine shared state"],
    ["tasks", "Active Pi tasks"],
    ["tools", "Tool definitions and selection"],
    ["extend", "Extensions and instructions"],
    ["new", "New numbered agent"],
    ["new-session", "New conversation in this project"],
    ["stop", "Cancel current work"],
    ["resume", "Resume interrupted work"],
  ].filter(([name]) => name?.startsWith(text.slice(1).toLowerCase()));
  const showCommands =
    !dismissed &&
    text.startsWith("/") &&
    !text.includes(" ") &&
    commands.length > 0;
  function execute(command: string) {
    onText("");
    setDismissed(false);
    setActive(0);
    onCommand(command);
  }
  return (
    <div className="relative shrink-0 bg-background px-3 pt-3 pb-4 sm:px-6">
      {showCommands && (
        <div
          role="listbox"
          id="chat-commands"
          aria-label="Slash commands"
          className="absolute inset-x-3 bottom-full z-20 mx-auto max-h-72 max-w-3xl overflow-y-auto border bg-popover p-1 shadow-lg"
        >
          {commands.map(([name, description], index) => (
            <button
              id={`chat-command-${index}`}
              type="button"
              role="option"
              aria-selected={active === index}
              key={name}
              className={`flex w-full justify-between gap-4 p-3 text-left text-xs ${active === index ? "bg-accent" : "hover:bg-accent"}`}
              onClick={() => execute(name ?? "")}
            >
              <span className="font-mono">/{name}</span>
              <span className="text-muted-foreground">{description}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="mx-auto max-w-3xl rounded-none border bg-muted/20 p-3 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring/30 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (showCommands) execute(commands[active]?.[0] ?? "");
          else if (!sending) onSend();
        }}
      >
        <label className="sr-only" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          className="field-sizing-content min-h-16 max-h-48 w-full resize-none bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-50"
          rows={2}
          maxLength={32000}
          placeholder="Give your agent something to work on, or type / for commands…"
          value={text}
          disabled={disabled}
          aria-controls={showCommands ? "chat-commands" : undefined}
          aria-activedescendant={
            showCommands ? `chat-command-${active}` : undefined
          }
          onChange={(event) => {
            onText(event.target.value);
            setActive(0);
            setDismissed(false);
          }}
          onKeyDown={(event) => {
            if (showCommands && !event.nativeEvent.isComposing) {
              if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                setActive(
                  (value) =>
                    (value +
                      (event.key === "ArrowDown" ? 1 : commands.length - 1)) %
                    commands.length,
                );
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDismissed(true);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                execute(commands[active]?.[0] ?? "");
                return;
              }
            }
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!sending) onSend(event.altKey ? "followUp" : undefined);
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {modelPicker}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled || uncertain || !modesAvailable}
                  />
                }
                aria-label="Message delivery mode"
                title={
                  mode === "steer"
                    ? "Steer current work"
                    : mode === "followUp"
                      ? "Queue follow-up"
                      : "Only when idle"
                }
              >
                {mode === "steer" ? (
                  <CornerDownRightIcon />
                ) : mode === "followUp" ? (
                  <ListPlusIcon />
                ) : (
                  <HandIcon />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-48">
                {(
                  [
                    {
                      value: "steer",
                      label: "Steer current work",
                      icon: CornerDownRightIcon,
                    },
                    {
                      value: "followUp",
                      label: "Queue follow-up",
                      icon: ListPlusIcon,
                    },
                    {
                      value: "reject",
                      label: "Only when idle",
                      icon: HandIcon,
                    },
                  ] as const
                ).map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    onClick={() => onMode(item.value)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    {mode === item.value && <CheckIcon className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {busy && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canCancel}
                onClick={onCancel}
                aria-label="Stop current work"
                title="Stop current work"
              >
                <SquareIcon data-icon="inline-start" aria-hidden="true" />
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              className="rounded-none"
              disabled={sending}
              aria-label={uncertain ? "Retry message" : "Send message"}
              title={uncertain ? "Retry message" : "Send message (Enter)"}
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </form>
      {hint && (
        <p
          role="status"
          className="mx-auto mt-2 max-w-3xl px-2 text-[11px] text-muted-foreground"
        >
          {hint}
        </p>
      )}
    </div>
  );
}

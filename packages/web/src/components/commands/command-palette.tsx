"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { useNavigationMemory } from "@/components/layout/navigation-memory";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { DialogTrigger } from "@/components/ui/dialog";
import {
  ariaShortcut,
  type CommandId,
  commandIds,
  commands,
  shortcutFor,
  shortcutFromEvent,
} from "@/lib/commands";
import { useShortcutPreferences } from "./shortcut-preferences";

export type CommandActions = Partial<Record<CommandId, () => void>>;

export function CommandPalette({ actions }: { actions: CommandActions }) {
  const { overrides, ready } = useShortcutPreferences();
  const { devices } = useDevices();
  const { memory } = useNavigationMemory();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const openingShortcut = shortcutFor("palette.open", overrides);
  const shortcutLabel =
    ready && openingShortcut
      ? openingShortcut.replace(
          "Mod",
          /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl",
        )
      : undefined;

  useEffect(() => {
    if (!ready || open) return;
    function keyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !event.cancelable) return;
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"], [role="menu"][data-open]',
        )
      )
        return;
      const id = commandIds.find(
        (key) => shortcutFor(key, overrides) === shortcut,
      );
      if (!id) return;
      if (
        id !== "palette.open" &&
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof HTMLElement &&
              (node.isContentEditable ||
                node.matches("input, textarea, select, [role=textbox]")),
          )
      )
        return;
      const run = id === "palette.open" ? () => setOpen(true) : actions[id];
      if (!run) return;
      event.preventDefault();
      if (!event.repeat) run();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [actions, open, overrides, ready]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-lg"
      trigger={
        <ControlTooltip
          label={
            shortcutLabel
              ? `Command palette (${shortcutLabel})`
              : "Command palette"
          }
        >
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size={shortcutLabel ? "sm" : "icon-sm"}
                aria-label="Open command palette"
                aria-keyshortcuts={ariaShortcut(openingShortcut)}
              />
            }
          >
            <Search data-icon={shortcutLabel ? "inline-start" : undefined} />
            {shortcutLabel && (
              <kbd className="rounded-sm border border-border px-1 font-sans text-[10px] text-muted-foreground">
                {shortcutLabel}
              </kbd>
            )}
          </DialogTrigger>
        </ControlTooltip>
      }
    >
      <Command>
        <CommandInput
          aria-label="Search commands"
          placeholder="Search commands…"
        />
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>
          <CommandGroup heading="Commands">
            {commandIds.map((id) => {
              const run = actions[id];
              if (!run) return null;
              const shortcut = shortcutFor(id, overrides);
              return (
                <CommandItem
                  key={id}
                  value={id}
                  keywords={[commands[id].label]}
                  onSelect={() => {
                    setOpen(false);
                    run();
                  }}
                >
                  {commands[id].label}
                  {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
                </CommandItem>
              );
            })}
          </CommandGroup>
          {devices.length > 0 && (
            <CommandGroup heading="Machines">
              {devices.map((device) => (
                <CommandItem
                  key={device.id}
                  value={`device:${device.id}`}
                  keywords={[device.name, device.url]}
                  onSelect={() => {
                    setOpen(false);
                    router.push(
                      memory.routes[device.id] ??
                        `/devices/${encodeURIComponent(device.id)}`,
                    );
                  }}
                >
                  {device.name}
                  <span className="ml-auto truncate text-muted-foreground">
                    {device.url}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

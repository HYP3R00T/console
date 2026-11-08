"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  commandWorksInEditor,
  formatShortcut,
  shortcutFor,
  shortcutFromEvent,
  shortcutsFor,
} from "@/lib/commands";
import { useCommands } from "./command-registry";
import { useShortcutPreferences } from "./shortcut-preferences";

export type CommandActions = Partial<Record<CommandId, () => void>>;

export function CommandPalette() {
  const registry = useCommands();
  const route = usePathname();
  const [commandError, setCommandError] = useState<string>();
  function invoke(id: CommandId) {
    try {
      Promise.resolve(registry.invoke(id)).catch((error) =>
        setCommandError(
          error instanceof Error ? error.message : "Command failed.",
        ),
      );
    } catch (error) {
      setCommandError(
        error instanceof Error ? error.message : "Command unavailable.",
      );
    }
  }
  const { overrides, ready, platform } = useShortcutPreferences();
  const { devices } = useDevices();
  const { memory } = useNavigationMemory();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<() => void>(undefined);
  const routeRef = useRef(route);
  routeRef.current = route;
  // biome-ignore lint/correctness/useExhaustiveDependencies: route changes cancel pending palette actions.
  useEffect(() => {
    setOpen(false);
    pendingAction.current = undefined;
  }, [route]);
  const openingShortcut = shortcutFor("palette.open", overrides);
  const shortcutLabel =
    ready && openingShortcut
      ? formatShortcut(openingShortcut, platform)
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
      const id = commandIds.find((key) =>
        shortcutsFor(key, overrides).includes(shortcut),
      );
      if (!id) return;
      if (
        !commandWorksInEditor(id) &&
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
      const handler = registry.get(id);
      const run =
        id === "palette.open"
          ? () => setOpen(true)
          : handler && !handler.disabled
            ? () => invoke(id)
            : undefined;
      if (!run) return;
      event.preventDefault();
      if (!event.repeat) run();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  });

  function select(run: () => void) {
    const selectedRoute = route;
    pendingAction.current = () => {
      if (routeRef.current === selectedRoute) run();
    };
    setOpen(false);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) pendingAction.current = undefined;
        setOpen(nextOpen);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen || !pendingAction.current) return;
        const run = pendingAction.current;
        pendingAction.current = undefined;
        // Base UI reports close completion inside its synchronous popup cleanup.
        queueMicrotask(run);
      }}
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
                aria-keyshortcuts={
                  shortcutsFor("palette.open", overrides)
                    .map(ariaShortcut)
                    .filter(Boolean)
                    .join(" ") || undefined
                }
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
        {commandError && <p role="alert">{commandError}</p>}
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>
          <CommandGroup heading="Commands">
            {commandIds.map((id) => {
              const handler = registry.get(id);
              if (!handler) return null;
              const run = () => invoke(id);
              const shortcut = shortcutFor(id, overrides);
              return (
                <CommandItem
                  key={id}
                  disabled={!!handler.disabled}
                  title={handler.disabled}
                  value={id}
                  keywords={[commands[id].label]}
                  onSelect={() => select(run)}
                >
                  {commands[id].label}
                  {shortcut && (
                    <CommandShortcut>
                      {formatShortcut(shortcut, platform)}
                    </CommandShortcut>
                  )}
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
                  onSelect={() =>
                    select(() => {
                      router.push(
                        memory.routes[device.id] ??
                          `/devices/${encodeURIComponent(device.id)}`,
                      );
                    })
                  }
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

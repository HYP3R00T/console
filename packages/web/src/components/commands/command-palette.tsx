"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConnections } from "@/components/connection-provider";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { useClientAppearance } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { CommandDialog } from "@/components/ui/command";
import { DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import {
  ariaShortcut,
  type CommandId,
  commandIds,
  commandWorksInEditor,
  formatShortcut,
  shortcutFor,
  shortcutFromEvent,
  shortcutsFor,
} from "@/lib/commands";
import {
  type AppearanceCommandId,
  type AppearancePicker,
  appearanceCommandIds,
  appearancePicker,
  applyAppearanceCommand,
} from "@/lib/configuration/appearance-command";
import { clientConfiguration } from "@/lib/configuration/store";
import {
  type PaletteTarget,
  paletteSelectionIsCurrent,
} from "@/lib/palette-navigation";
import { preferenceTarget } from "@/lib/preferences-navigation";
import { useCommands, useRegisterCommands } from "./command-registry";
import { PaletteBrowser, type PaletteFilter } from "./palette-browser";
import { useShortcutPreferences } from "./shortcut-preferences";

export type CommandActions = Partial<Record<CommandId, () => void>>;

export function CommandPalette({
  target = {},
  currentTitle,
}: {
  target?: PaletteTarget;
  currentTitle?: string;
}) {
  const registry = useCommands();
  const searchInput = useRef<HTMLInputElement>(null);
  const route = usePathname();
  const { manager } = useConnections();
  const [initialTarget, setInitialTarget] = useState(target);
  function failed(error: unknown) {
    toast.add({
      type: "error",
      title: "Command failed",
      description:
        error instanceof Error ? error.message : "Command unavailable.",
    });
  }
  function invoke(id: CommandId, input?: unknown) {
    try {
      Promise.resolve(registry.invoke(id, input)).catch(failed);
    } catch (error) {
      failed(error);
    }
  }
  const { overrides, ready, platform } = useShortcutPreferences();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const appearance = useClientAppearance();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaletteFilter>("all");
  const [picker, setPicker] = useState<{
    id: AppearanceCommandId;
    view: AppearancePicker;
    initialValue: string;
  }>();
  useRegisterCommands({
    "navigation.conversations": {
      run: () => {
        setQuery("");
        setFilter("conversations");
        setPicker(undefined);
        setOpen(true);
      },
    },
    ...Object.fromEntries(
      appearanceCommandIds.map((id) => [
        id,
        {
          disabled: !appearance.ready
            ? "Wait for client preferences to load."
            : appearance.error,
          run: (input?: unknown) => {
            if (input === undefined) {
              setInitialTarget(
                preferenceTarget(
                  target,
                  new URLSearchParams(window.location.search),
                ),
              );
              const view = appearancePicker(
                id,
                appearance.activeMode ?? "light",
              );
              setPicker({
                id,
                view,
                initialValue:
                  view.kind === "mode"
                    ? appearance.appearance.mode
                    : view.mode === "dark"
                      ? appearance.appearance.darkTheme
                      : appearance.appearance.lightTheme,
              });
              setOpen(true);
              return;
            }
            applyAppearanceCommand(clientConfiguration(), id, input);
            setOpen(false);
            toast.add({
              title: "Appearance saved",
              description:
                id === "appearance.mode"
                  ? "Display mode updated."
                  : "Your theme default is saved; display mode is unchanged.",
            });
          },
        },
      ]),
    ),
  });
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

  function changeOpen(next: boolean) {
    if (next) {
      pendingAction.current = undefined;
      setPicker(undefined);
      setQuery("");
      setFilter("all");
      setInitialTarget(
        preferenceTarget(target, new URLSearchParams(window.location.search)),
      );
    }
    setOpen(next);
  }

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
          ? () => changeOpen(true)
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
    const selectedUrl = window.location.href;
    const selectedClient = target.deviceId
      ? manager.snapshot()[target.deviceId]?.client
      : undefined;
    pendingAction.current = () => {
      if (
        paletteSelectionIsCurrent(
          { route: selectedRoute, url: selectedUrl, client: selectedClient },
          {
            route: routeRef.current,
            url: window.location.href,
            client: target.deviceId
              ? manager.snapshot()[target.deviceId]?.client
              : undefined,
          },
        )
      )
        run();
    };
    setOpen(false);
  }

  return (
    <CommandDialog
      open={open}
      initialFocus={searchInput}
      onOpenChange={changeOpen}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen || !pendingAction.current) return;
        const run = pendingAction.current;
        pendingAction.current = undefined;
        // Base UI reports close completion inside its synchronous popup cleanup.
        queueMicrotask(run);
      }}
      description="Search across machines, projects, conversations, actions and settings. Commands show their execution target."
      className="top-[10svh] max-h-[85svh] sm:max-w-2xl"
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
      <PaletteBrowser
        inputRef={searchInput}
        open={open}
        initialTarget={initialTarget}
        currentTarget={target}
        currentTitle={currentTitle}
        picker={picker}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        onBack={() => setPicker(undefined)}
        applyPicker={(id, input) => registry.invoke(id, input)}
        overrides={overrides}
        platform={platform}
        getCommand={registry.get}
        selectCommand={(id, input) =>
          appearanceCommandIds.includes(id as AppearanceCommandId) ||
          id === "navigation.conversations"
            ? invoke(id, input)
            : select(() => invoke(id, input))
        }
        navigate={(href) => select(() => router.push(href))}
      />
    </CommandDialog>
  );
}

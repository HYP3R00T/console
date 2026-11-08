"use client";
import {
  ArrowLeft,
  Folder,
  History,
  MessageSquare,
  Monitor,
  Pin,
  Settings,
  Terminal,
  Zap,
} from "lucide-react";
import { type RefObject, useLayoutEffect, useState } from "react";
import { useNavigationMemory } from "@/components/layout/navigation-memory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CommandHandler } from "@/lib/command-registry";
import {
  type CommandId,
  commandIds,
  commands,
  formatShortcut,
  type ShortcutOverrides,
  shortcutFor,
} from "@/lib/commands";
import type {
  AppearanceCommandId,
  AppearancePicker,
} from "@/lib/configuration/appearance-command";
import {
  type PaletteDestination,
  type PaletteTarget,
  paletteCommandGroup,
  paletteCommandTarget,
  rememberedDestinations,
  targetKey,
  targetLabel,
  withinScope,
} from "@/lib/palette-navigation";
import {
  commandAliases,
  paletteSearchScore,
  paletteSelection,
  rankPaletteResults,
} from "@/lib/palette-search";
import { scopedSettingsDestinations } from "@/lib/preferences-navigation";
import { AppearancePickerView } from "./appearance-picker";
import { usePaletteCatalog } from "./use-palette-catalog";

export type PaletteFilter = "all" | "conversations" | "actions" | "settings";
const icons = {
  machine: Monitor,
  project: Folder,
  session: Terminal,
  conversation: MessageSquare,
};
const quickIds: CommandId[] = [
  "navigation.conversations",
  "appearance.theme",
  "workspace.navigation",
  "workspace.details",
  "settings.open",
];
const settingCommands: Record<string, CommandId> = {
  project: "project.agent-settings.update",
  session: "session.runtime-settings.update",
  conversation: "conversation.configure",
  "machine:providers": "machine.providers",
  "machine:runtime": "machine.runtime",
  "machine:guidance": "machine.workspace-guidance.update",
  "machine:projects": "machine.projects",
  "machine:archives": "machine.archives",
};
function Section({
  label,
  Icon,
  count,
  children,
}: {
  label: string;
  Icon: typeof Folder;
  count: number;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <CommandGroup
      emphasis
      heading={
        <>
          <Icon className="size-3.5" aria-hidden="true" />
          <span>{label}</span>
          <span className="ml-auto font-normal tabular-nums">{count}</span>
        </>
      }
    >
      {children}
    </CommandGroup>
  );
}
export function PaletteBrowser({
  open,
  inputRef,
  initialTarget,
  currentTarget,
  currentTitle,
  overrides,
  platform,
  getCommand,
  selectCommand,
  navigate,
  picker,
  onBack,
  applyPicker,
  query,
  onQueryChange,
  filter,
  onFilterChange,
}: {
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  initialTarget: PaletteTarget;
  currentTarget: PaletteTarget;
  currentTitle?: string;
  overrides: ShortcutOverrides;
  platform: string;
  getCommand: (id: CommandId) => CommandHandler | undefined;
  selectCommand: (id: CommandId, input?: unknown) => void;
  navigate: (href: string) => void;
  picker?: {
    id: AppearanceCommandId;
    view: AppearancePicker;
    initialValue: string;
  };
  onBack: () => void;
  applyPicker: (id: AppearanceCommandId, input: unknown) => unknown;
  query: string;
  onQueryChange: (query: string) => void;
  filter: PaletteFilter;
  onFilterChange: (filter: PaletteFilter) => void;
}) {
  const [scope, setScope] = useState<PaletteTarget>({});
  const [selected, setSelected] = useState("");
  const catalog = usePaletteCatalog(open && !picker);
  const { memory } = useNavigationMemory();
  useLayoutEffect(() => {
    if (!picker) inputRef.current?.focus();
  }, [picker, inputRef]);
  const pinned = catalog.destinations.filter((item) => item.pinned);
  const remembered = rememberedDestinations(
    catalog.destinations,
    memory.recentRoutes ?? Object.values(memory.routes),
  );
  const recent = remembered.filter((item) => !item.pinned).slice(0, 6);
  const visiblePinned = pinned.filter(
    (item) =>
      withinScope(item.target, scope) &&
      (filter !== "conversations" || item.kind === "conversation"),
  );
  const visibleRecent = recent.filter(
    (item) =>
      withinScope(item.target, scope) &&
      (filter !== "conversations" || item.kind === "conversation"),
  );
  const searchable = [
    ...catalog.destinations,
    ...remembered.filter(
      (item) =>
        !catalog.destinations.some(
          (other) => targetKey(other.target) === targetKey(item.target),
        ),
    ),
  ];
  const available = rankPaletteResults(
    searchable.filter((item) => withinScope(item.target, scope)),
    (item) =>
      paletteSearchScore(query, [item.label], [...item.path, item.kind]),
    (item) => (item.target.deviceId === initialTarget.deviceId ? 5 : 0),
  );
  const local = available.filter(
    (item) =>
      (query.trim() ||
        ![...pinned, ...recent].some(
          (other) => targetKey(other.target) === targetKey(item.target),
        )) &&
      (!query.trim()
        ? item.kind !== "conversation" || item.id.indexOf("remembered:") !== 0
        : true),
  );
  const contexts = [
    currentTarget,
    initialTarget,
    scope,
    ...catalog.destinations
      .filter((item) => item.kind === "machine")
      .map((item) => item.target),
  ];
  const unique = new Map<
    string,
    ReturnType<typeof scopedSettingsDestinations>[number]
  >();
  for (const context of contexts)
    for (const item of scopedSettingsDestinations(context))
      unique.set(
        `${item.input.destination}:${targetKey(item.input.target)}`,
        item,
      );
  const scopedSettings = rankPaletteResults(
    [...unique.values()].filter(
      (item) => withinScope(item.input.target, scope) || !scope.deviceId,
    ),
    (item) =>
      paletteSearchScore(
        query,
        [item.label],
        [targetLabel(item.input.target, catalog.destinations)],
      ),
  )
    .map((item) => {
      const known = settingCommands[item.input.destination];
      const id =
        known &&
        withinScope(currentTarget, item.input.target) &&
        getCommand(known)
          ? known
          : "settings.open";
      return {
        ...item,
        id,
        disabled: getCommand(id)?.disabled,
        targetLabel: targetLabel(item.input.target, catalog.destinations),
      };
    })
    .filter((item) => query.trim() || !item.disabled);
  const settingIds = new Set(
    scopedSettings
      .filter((item) => item.id !== "settings.open")
      .map((item) => item.id),
  );
  if (settingIds.has("machine.runtime"))
    settingIds.add("machine.runtime-defaults.update");
  const rows = rankPaletteResults(
    commandIds.flatMap((id) => {
      const registered = getCommand(id);
      const unavailable =
        id === "workspace.details"
          ? "Open a conversation to show its details panel."
          : id === "workspace.navigation"
            ? "This page has no workspace navigation."
            : id.startsWith("conversation.")
              ? "Open a conversation to use this action."
              : undefined;
      const handler =
        registered ??
        (query.trim() && unavailable
          ? { disabled: unavailable, run: () => undefined }
          : undefined);
      if (
        !handler ||
        id === "palette.open" ||
        (settingIds.has(id) && !query.includes(".")) ||
        (!query.trim() && handler.disabled)
      )
        return [];
      const target = paletteCommandTarget(id, currentTarget);
      return [
        {
          id,
          handler,
          group: paletteCommandGroup(id),
          label:
            target === "client"
              ? "Client"
              : targetLabel(target, catalog.destinations),
        },
      ];
    }),
    (row) =>
      paletteSearchScore(query, [
        commands[row.id].label,
        ...commandAliases(row.id),
        row.id,
      ]),
  );
  const quick =
    !query.trim() && filter === "all"
      ? rows.filter((row) => quickIds.includes(row.id))
      : [];
  const remaining = rows.filter((row) => !quick.includes(row));
  const actions = remaining.filter((row) => row.group === "Actions");
  const settings = remaining.filter((row) => row.group === "Settings");
  const navigation = filter === "all" || filter === "conversations";
  const options: { value: string; disabled?: boolean }[] = [];
  if (navigation && !query.trim()) {
    for (const item of visiblePinned)
      options.push({ value: `pinned:${item.id}`, disabled: !!item.disabled });
    for (const item of visibleRecent)
      options.push({ value: `recent:${item.id}`, disabled: !!item.disabled });
  }
  for (const row of quick)
    options.push({
      value: `command:${row.id}`,
      disabled: !!row.handler.disabled,
    });
  if (navigation)
    for (const kind of [
      "machine",
      "project",
      "session",
      "conversation",
    ] as const)
      for (const item of local)
        if (
          item.kind === kind &&
          (filter !== "conversations" || kind === "conversation")
        )
          options.push({
            value: `${kind}:${item.id}`,
            disabled: !!item.disabled,
          });
  if (filter === "all" || filter === "actions")
    for (const row of actions)
      options.push({
        value: `command:${row.id}`,
        disabled: !!row.handler.disabled,
      });
  if (filter === "all" || filter === "settings") {
    for (const row of settings)
      options.push({
        value: `command:${row.id}`,
        disabled: !!row.handler.disabled,
      });
    for (const item of scopedSettings)
      options.push({
        value: `settings:${item.input.destination}:${targetKey(item.input.target)}`,
        disabled: !!item.disabled,
      });
  }
  const nextSelection = paletteSelection(selected, options);
  useLayoutEffect(() => {
    if (!picker && selected !== nextSelection) setSelected(nextSelection);
  }, [picker, selected, nextSelection]);
  function browse(target: PaletteTarget) {
    setSelected("");
    setScope(target);
    onQueryChange("");
    inputRef.current?.focus();
  }
  function result(item: PaletteDestination, group: string) {
    const Icon = icons[item.kind];
    return (
      <CommandItem
        key={`${group}:${item.id}`}
        value={`${group}:${item.id}`}
        disabled={!!item.disabled}
        title={item.disabled}
        onSelect={() =>
          item.kind === "conversation" && item.href
            ? navigate(item.href)
            : browse(item.target)
        }
      >
        <Icon />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">
            {item.label}
          </span>
          <span className="block truncate text-foreground/80">
            {item.description ?? item.path.slice(0, -1).join(" / ")}
          </span>
        </span>
        <span className="shrink-0 text-foreground/80">
          {item.kind === "conversation" ? "Open" : "Browse"}
        </span>
      </CommandItem>
    );
  }
  function command(row: (typeof rows)[number]) {
    const shortcut = shortcutFor(row.id, overrides);
    return (
      <CommandItem
        key={row.id}
        disabled={!!row.handler.disabled}
        title={row.handler.disabled}
        value={`command:${row.id}`}
        onSelect={() => selectCommand(row.id)}
      >
        {row.group === "Settings" ? <Settings /> : <Zap />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">
            {commands[row.id].label}
          </span>
          <span className="block truncate text-foreground/80">
            {row.label}
            {row.handler.disabled ? ` · ${row.handler.disabled}` : ""}
          </span>
        </span>
        {shortcut && (
          <CommandShortcut>
            {formatShortcut(shortcut, platform)}
          </CommandShortcut>
        )}
      </CommandItem>
    );
  }
  if (picker)
    return (
      <AppearancePickerView
        key={picker.id}
        picker={picker.view}
        commandId={picker.id}
        initialValue={picker.initialValue}
        inputRef={inputRef}
        onBack={onBack}
        onApply={applyPicker}
      />
    );
  return (
    <Command
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      className="min-h-0"
    >
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <h2 className="truncate text-sm font-semibold">Command palette</h2>
        </div>
        {scope.deviceId ? (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => browse({})}
            aria-label="Clear search scope"
          >
            <ArrowLeft data-icon="inline-start" />
            All machines
          </Button>
        ) : (
          <Badge variant="secondary">All machines</Badge>
        )}
      </header>
      <CommandInput
        ref={inputRef}
        aria-label="Search commands and destinations"
        placeholder="Search conversations, projects, themes or actions…"
        value={query}
        onValueChange={(value) => {
          setSelected("");
          onQueryChange(value);
        }}
        onKeyDown={(event) => {
          if (
            !event.nativeEvent.isComposing &&
            event.key === "Backspace" &&
            !query &&
            scope.deviceId
          ) {
            event.preventDefault();
            browse({});
          }
        }}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2">
        <ToggleGroup
          value={[filter]}
          onValueChange={(values) => {
            if (values[0]) {
              setSelected("");
              onFilterChange(values[0] as PaletteFilter);
              inputRef.current?.focus();
            }
          }}
          size="sm"
          spacing={1}
          aria-label="Result type"
        >
          {(
            [
              ["all", "All"],
              ["conversations", "Conversations"],
              ["actions", "Actions"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <ToggleGroupItem key={id} value={id} aria-label={label}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title={
            scope.deviceId
              ? targetLabel(scope, catalog.destinations)
              : currentTitle
                ? `Current conversation: ${currentTitle}`
                : "Search all connected machines"
          }
        >
          {scope.deviceId
            ? `Filter: ${targetLabel(scope, catalog.destinations)}`
            : "Global search"}
        </span>
      </div>
      <ScrollArea
        className="h-[min(55svh,30rem)] min-h-0"
        viewportClassName="min-h-0"
      >
        <CommandList
          className="max-h-none overflow-visible px-3 py-2"
          aria-label="Commands and destinations"
        >
          <CommandEmpty>
            {catalog.loading
              ? "Loading destinations…"
              : "No matching results. Try ‘theme’, ‘left panel’ or a conversation name."}
          </CommandEmpty>
          {navigation && !query.trim() && (
            <>
              <Section
                label="Pinned destinations"
                Icon={Pin}
                count={visiblePinned.length}
              >
                {pinned
                  .filter(
                    (item) =>
                      withinScope(item.target, scope) &&
                      (filter !== "conversations" ||
                        item.kind === "conversation"),
                  )
                  .map((item) => result(item, "pinned"))}
              </Section>
              <Section
                label="Recent destinations"
                Icon={History}
                count={visibleRecent.length}
              >
                {recent
                  .filter(
                    (item) =>
                      withinScope(item.target, scope) &&
                      (filter !== "conversations" ||
                        item.kind === "conversation"),
                  )
                  .map((item) => result(item, "recent"))}
              </Section>
            </>
          )}
          <Section label="Quick actions" Icon={Zap} count={quick.length}>
            {quick.map(command)}
          </Section>
          {navigation &&
            (["machine", "project", "session", "conversation"] as const).map(
              (kind) => {
                const items = local.filter(
                  (item) =>
                    item.kind === kind &&
                    (filter !== "conversations" || kind === "conversation"),
                );
                return (
                  <Section
                    key={kind}
                    label={
                      {
                        machine: "Machines",
                        project: "Projects",
                        session: "Sessions",
                        conversation: "Conversations",
                      }[kind]
                    }
                    Icon={icons[kind]}
                    count={items.length}
                  >
                    {items.map((item) => result(item, kind))}
                  </Section>
                );
              },
            )}
          {(filter === "all" || filter === "actions") && (
            <Section label="Actions" Icon={Zap} count={actions.length}>
              {actions.map(command)}
            </Section>
          )}
          {(filter === "all" || filter === "settings") && (
            <Section
              label="Settings"
              Icon={Settings}
              count={settings.length + scopedSettings.length}
            >
              {settings.map(command)}
              {scopedSettings.map((item) => (
                <CommandItem
                  key={`${item.input.destination}:${targetKey(item.input.target)}`}
                  value={`settings:${item.input.destination}:${targetKey(item.input.target)}`}
                  disabled={!!item.disabled}
                  title={item.disabled}
                  onSelect={() =>
                    selectCommand(
                      item.id,
                      item.id === "settings.open" ? item.input : undefined,
                    )
                  }
                >
                  <Settings />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="block truncate text-foreground/80">
                      {item.disabled
                        ? `${item.targetLabel} · ${item.disabled}`
                        : item.targetLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-foreground/80">Open</span>
                </CommandItem>
              ))}
            </Section>
          )}
        </CommandList>
      </ScrollArea>
      <footer className="flex shrink-0 flex-col gap-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <p>↑↓ Navigate · Enter selects · Escape closes</p>
        {catalog.loading && <p role="status">Searching connected machines…</p>}
        {catalog.more && (
          <p>Some sessions return only their first 200 conversations.</p>
        )}
        {catalog.errors.length > 0 && (
          <div role="status" className="flex items-center gap-2">
            <span title={catalog.errors.join("\n")}>
              Some destinations could not load. Local commands remain available.
            </span>
            <Button variant="ghost" size="xs" onClick={catalog.retry}>
              Retry
            </Button>
          </div>
        )}
      </footer>
    </Command>
  );
}

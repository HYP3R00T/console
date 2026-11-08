"use client";
import { Keyboard, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { commands, formatShortcut } from "@/lib/commands";
import type { ShortcutRow as Row } from "@/lib/shortcut-editor";

type Action = { label: string; disabled?: boolean; run: () => void };
function Actions({
  groups,
  dropdown,
}: {
  groups: Action[][];
  dropdown: boolean;
}) {
  const Group = dropdown ? DropdownMenuGroup : ContextMenuGroup;
  const Item = dropdown ? DropdownMenuItem : ContextMenuItem;
  const Separator = dropdown ? DropdownMenuSeparator : ContextMenuSeparator;
  return groups.map((actions, index) => (
    <Group key={actions[0].label}>
      {index > 0 && <Separator />}
      {actions.map((action) => (
        <Item
          key={action.label}
          disabled={action.disabled}
          onClick={action.run}
        >
          {action.label}
        </Item>
      ))}
    </Group>
  ));
}
export function ShortcutTableRow({
  row,
  platform,
  ready,
  customized,
  onEdit,
  onAdd,
  onRemove,
  onReset,
  onCopy,
}: {
  row: Row;
  platform: string;
  ready: boolean;
  customized: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onReset: () => void;
  onCopy: (value: string) => void;
}) {
  const [contextOpen, setContextOpen] = useState(false),
    [dropdownOpen, setDropdownOpen] = useState(false);
  const label = commands[row.id].label;
  const groups: Action[][] = [
    [
      {
        label: "Copy",
        run: () =>
          onCopy(
            JSON.stringify(
              { command: row.id, keybinding: row.binding },
              null,
              2,
            ),
          ),
      },
      { label: "Copy command ID", run: () => onCopy(row.id) },
      { label: "Copy command title", run: () => onCopy(label) },
      {
        label: "Copy keybinding",
        disabled: !row.binding,
        run: () => onCopy(row.binding ?? ""),
      },
    ],
    [
      { label: "Change keybinding…", disabled: !ready, run: onEdit },
      { label: "Add keybinding…", disabled: !ready, run: onAdd },
    ],
    [
      {
        label: "Remove keybinding",
        disabled: !ready || !row.binding,
        run: onRemove,
      },
      {
        label: "Reset keybindings",
        disabled: !ready || !customized,
        run: onReset,
      },
    ],
  ];
  return (
    <ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
      <ContextMenuTrigger
        render={<TableRow />}
        tabIndex={0}
        aria-label={`${label}, ${formatShortcut(row.binding, platform)}, ${row.source}`}
        aria-description="Enter edits this binding. Right-click or press Shift+F10 for more actions."
        data-state={contextOpen || dropdownOpen ? "selected" : undefined}
        className="group outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        onDoubleClick={(event) => {
          if (ready && !(event.target as HTMLElement).closest("button"))
            onEdit();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" && ready) {
            event.preventDefault();
            onEdit();
          }
        }}
      >
        <TableCell className="w-20">
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-aria-expanded:opacity-100 [@media(hover:none)]:opacity-100">
            <ControlTooltip label="Change keybinding">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Change keybinding for ${label}`}
                disabled={!ready}
                onClick={onEdit}
              >
                <Keyboard />
              </Button>
            </ControlTooltip>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${label}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <Actions groups={groups} dropdown />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
        <TableCell className="w-1/2 whitespace-normal" title={row.id}>
          {label}
        </TableCell>
        <TableCell>
          {row.binding ? (
            <span className="inline-flex items-center gap-1">
              {formatShortcut(row.binding, platform)
                .split(" + ")
                .map((key, index) => (
                  <span key={key} className="inline-flex items-center gap-1">
                    {index > 0 && (
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground"
                      >
                        +
                      </span>
                    )}
                    <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {key}
                    </kbd>
                  </span>
                ))}
            </span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </TableCell>
        <TableCell className="w-28 text-muted-foreground">
          {row.source}
        </TableCell>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        <Actions groups={groups} dropdown={false} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

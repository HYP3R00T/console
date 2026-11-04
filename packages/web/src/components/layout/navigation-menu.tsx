"use client";
import { type LucideIcon, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NavigationAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separator?: boolean;
};
function ActionItems({
  actions,
  dropdown,
}: {
  actions: NavigationAction[];
  dropdown: boolean;
}) {
  const Item = dropdown ? DropdownMenuItem : ContextMenuItem;
  const Separator = dropdown ? DropdownMenuSeparator : ContextMenuSeparator;
  return actions.map((action) => (
    <div key={action.label}>
      {action.separator && <Separator />}
      <Item
        disabled={action.disabled}
        variant={action.destructive ? "destructive" : "default"}
        onClick={action.onSelect}
      >
        <action.icon />
        {action.label}
      </Item>
    </div>
  ));
}
export function NavigationMenu({
  label,
  actions,
  children,
}: {
  label: string;
  actions: NavigationAction[];
  children: (menu: ReactNode) => ReactNode;
}) {
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={label}
            title={label}
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <ActionItems actions={actions} dropdown />
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex min-w-0 flex-col"
        aria-description="Right-click or press Shift+F10 for actions."
      >
        {children(menu)}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ActionItems actions={actions} dropdown={false} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

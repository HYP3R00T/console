"use client";
import { type LucideIcon, MoreHorizontal } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
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
import {
  type NavigationActionId,
  type NavigationEntityKind,
  supportsNavigationAction,
} from "@/lib/navigation-actions";
import type { NavigationDragItem } from "@/lib/navigation-drop";
import { useNavigationDrag } from "./navigation-drag";

const MenuOpen = createContext(false);
export const useNavigationMenuOpen = () => useContext(MenuOpen);

/** One action definition feeds both menus and optional primary hover shortcuts. */
export type NavigationAction = {
  id: NavigationActionId;
  primary?: boolean;
  shortcutLabel?: string;
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
    <div key={action.id}>
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
  kind,
  dragItem,
  actions,
  children,
}: {
  label: string;
  kind: NavigationEntityKind;
  dragItem?: NavigationDragItem;
  actions: NavigationAction[];
  children: (menu: ReactNode) => ReactNode;
}) {
  const entityActions = actions.filter((action) =>
    supportsNavigationAction(kind, action.id),
  );
  const drag = useNavigationDrag();
  const [contextOpen, setContextOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menu = (
    <>
      {entityActions
        .filter((action) => action.primary)
        .map((action) => (
          <Button
            key={action.id}
            variant="ghost"
            size="icon"
            className="size-6 [&_svg]:size-3.5"
            aria-label={action.shortcutLabel ?? action.label}
            title={action.shortcutLabel ?? action.label}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            <action.icon />
          </Button>
        ))}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-6 [&_svg]:size-3.5"
              aria-label={label}
              title={label}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <ActionItems actions={entityActions} dropdown />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
  return (
    <MenuOpen value={contextOpen || dropdownOpen}>
      <ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
        <ContextMenuTrigger
          className="navigation-menu-target flex min-w-0 flex-col"
          data-navigation-kind={kind}
          data-menu-open={contextOpen || dropdownOpen || undefined}
          data-drag-kind={dragItem?.kind}
          data-drag-project={
            dragItem?.kind === "conversation"
              ? dragItem.projectId
              : dragItem?.id
          }
          draggable={!!dragItem && !!drag}
          onDragStart={(event) => {
            if (dragItem) drag?.start(dragItem, event);
          }}
          onDragEnd={() => drag?.end()}
          aria-description="Right-click or press Shift+F10 for actions."
        >
          {children(menu)}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <ActionItems actions={entityActions} dropdown={false} />
        </ContextMenuContent>
      </ContextMenu>
    </MenuOpen>
  );
}

"use client";

import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { NavigationDropTarget } from "@/lib/navigation-drop";
import { NavigationDropZone } from "./navigation-drag";
import { type NavigationAction, NavigationMenu } from "./navigation-menu";
import { NavigationRow } from "./navigation-row";

/** A section disclosure composed from the same primitive as project rows. */
export function NavigationSection({
  label,
  children,
  actions = [],
  dropTarget,
  open: controlledOpen,
  onOpenChange,
}: {
  label: string;
  children: ReactNode;
  actions?: NavigationAction[];
  dropTarget: NavigationDropTarget;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <NavigationDropZone target={dropTarget}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        render={<section aria-label={label} />}
      >
        <NavigationMenu
          kind="section"
          label={`${label} actions`}
          actions={[
            ...actions,
            {
              id: "toggle-section",
              label: open ? "Collapse section" : "Expand section",
              icon: open ? ChevronsDownUp : ChevronsUpDown,
              onSelect: () => setOpen(!open),
            },
          ]}
        >
          {(menu) => (
            <NavigationRow actions={menu}>
              <h3>
                <CollapsibleTrigger className="flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring">
                  <span>{label}</span>
                  <ChevronRight
                    aria-hidden
                    className={`size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-180 ${open ? "rotate-90" : ""}`}
                  />
                </CollapsibleTrigger>
              </h3>
            </NavigationRow>
          )}
        </NavigationMenu>
        <CollapsibleContent keepMounted className="navigation-disclosure">
          <div className="pt-1.5">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </NavigationDropZone>
  );
}

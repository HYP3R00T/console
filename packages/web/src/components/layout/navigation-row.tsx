"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNavigationMenuOpen } from "./navigation-menu";

/** Separate click targets share one hover/focus surface; action width never shifts labels. */
export function NavigationRow({
  children,
  actions,
  selected = false,
}: {
  children: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
}) {
  const menuOpen = useNavigationMenuOpen();
  return (
    <div
      data-menu-open={menuOpen || undefined}
      className={cn(
        "navigation-row-group my-px flex min-w-0 items-center rounded-md transition-colors hover:bg-sidebar-accent",
        selected && "bg-sidebar-accent",
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions && (
        <div className="navigation-actions flex shrink-0 items-center gap-0.5 pr-1">
          {actions}
        </div>
      )}
    </div>
  );
}

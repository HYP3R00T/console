import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  return (
    <div
      className={cn(
        "navigation-row-group flex min-w-0 items-center hover:bg-sidebar-accent focus-within:bg-sidebar-accent",
        selected && "bg-sidebar-accent",
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions && (
        <div className="navigation-actions flex shrink-0 items-center">
          {actions}
        </div>
      )}
    </div>
  );
}

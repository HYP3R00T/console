"use client";

import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type TreeAction, TreeRow } from "@/components/navigation/tree-row";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function Branch({
  label,
  name,
  children,
  actions,
  initial = false,
  onActivate,
  editing,
  quickAction,
  selected = false,
  storageKey,
  indentChildren = true,
}: {
  label: ReactNode;
  name: string;
  children: ReactNode;
  actions?: TreeAction[];
  initial?: boolean;
  onActivate?: () => void;
  editing?: boolean;
  quickAction?: TreeAction;
  selected?: boolean;
  storageKey: string;
  indentChildren?: boolean;
}) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setOpen(saved === "true" ? true : saved === "false" ? false : initial);
    } catch {
      /* Keep navigation usable when browser storage is unavailable. */
    }
  }, [storageKey, initial]);
  function toggle(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      /* Keep the current in-memory state without persistent storage. */
    }
  }
  return (
    <Collapsible open={open} onOpenChange={toggle} className="min-w-0">
      <TreeRow
        name={name}
        actions={editing ? [] : actions}
        quickAction={quickAction}
        className={selected ? "bg-accent" : ""}
      >
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-1">
            <span className="size-5 shrink-0" aria-hidden="true" />
            {label}
          </div>
        ) : (
          <CollapsibleTrigger
            aria-label={name}
            aria-current={selected ? "page" : undefined}
            onClick={onActivate}
            className="group flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-1 text-left text-xs"
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              <ChevronRightIcon className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
            </span>
            {label}
          </CollapsibleTrigger>
        )}
      </TreeRow>
      <CollapsibleContent>
        <div className={indentChildren ? "ml-2.5 border-l pl-2" : ""}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

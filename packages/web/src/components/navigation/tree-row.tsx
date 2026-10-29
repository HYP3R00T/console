"use client";

import { CheckIcon, EllipsisIcon, type LucideIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TreeAction = {
  label: string;
  icon: LucideIcon;
  run: () => void | Promise<void>;
  destructive?: boolean;
  disabled?: boolean;
};

export function TreeRow({
  name,
  actions = [],
  children,
  className = "",
  quickAction,
}: {
  name: string;
  actions?: TreeAction[];
  children: ReactNode;
  className?: string;
  quickAction?: TreeAction;
}) {
  const [pending, setPending] = useState<TreeAction>();
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (pending) confirm.current?.focus();
    else if (restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [pending]);
  function choose(action: TreeAction) {
    if (action.disabled) return;
    if (action.destructive) setPending(action);
    else action.run();
  }
  function cancel() {
    restoreFocus.current = true;
    setPending(undefined);
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<div />}
        className={`group/row flex min-h-8 min-w-0 items-center gap-0.5 hover:bg-accent/60 focus-within:bg-accent/60 ${className}`}
      >
        {children}
        {quickAction && !pending && (
          <Button
            size="icon-xs"
            variant="ghost"
            className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label={quickAction.label}
            disabled={quickAction.disabled}
            onClick={() => choose(quickAction)}
          >
            <quickAction.icon className="size-3" />
          </Button>
        )}
        {actions.length > 0 &&
          (pending ? (
            <fieldset
              className="flex shrink-0"
              aria-label="Confirm deletion"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  cancel();
                }
              }}
            >
              <Button
                ref={confirm}
                size="icon-xs"
                variant="ghost"
                className="text-destructive"
                aria-label={`Confirm moving ${name} to Trash`}
                onClick={() => {
                  setPending(undefined);
                  pending.run();
                }}
              >
                <CheckIcon className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Cancel moving ${name} to Trash`}
                onClick={cancel}
              >
                <XIcon className="size-3" />
              </Button>
            </fieldset>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button ref={trigger} size="icon-xs" variant="ghost" />}
                aria-label={`Actions for ${name}`}
                className="shrink-0 p-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <EllipsisIcon className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-44"
                finalFocus={() =>
                  document.querySelector<HTMLInputElement>(
                    'input[aria-label^="Rename "]',
                  ) ??
                  confirm.current ??
                  trigger.current
                }
              >
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    disabled={action.disabled}
                    variant={action.destructive ? "destructive" : "default"}
                    onClick={() => choose(action)}
                  >
                    <action.icon className="size-3" />
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
      </ContextMenuTrigger>
      <ContextMenuContent
        finalFocus={() =>
          document.querySelector<HTMLInputElement>(
            'input[aria-label^="Rename "]',
          ) ??
          confirm.current ??
          trigger.current
        }
      >
        {actions.map((action) => (
          <ContextMenuItem
            key={action.label}
            disabled={action.disabled}
            variant={action.destructive ? "destructive" : "default"}
            onClick={() => choose(action)}
          >
            <action.icon className="size-3" />
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

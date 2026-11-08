"use client";

import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";
import { CheckIcon, SearchIcon } from "lucide-react";
import type * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  trigger,
  className,
  showCloseButton = false,
  initialFocus,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  initialFocus?: React.ComponentProps<typeof DialogContent>["initialFocus"];
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      {trigger}
      <DialogContent
        initialFocus={initialFocus}
        className={cn(
          "top-1/3 translate-y-0 overflow-hidden rounded-md p-0",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-11 shrink-0 items-center gap-2 border-y bg-muted/40 px-3 focus-within:bg-muted/70"
    >
      <SearchIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-full w-full min-w-0 rounded-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-0 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-xs", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  emphasis = false,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group> & {
  emphasis?: boolean;
}) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:text-muted-foreground",
        emphasis &&
          "pb-2 pt-4 first:pt-1 **:[[cmdk-group-heading]]:mb-2 **:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:items-center **:[[cmdk-group-heading]]:gap-2 **:[[cmdk-group-heading]]:py-0 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:text-foreground/60",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-xs outline-hidden select-none in-data-[slot=dialog-content]:rounded-md! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};

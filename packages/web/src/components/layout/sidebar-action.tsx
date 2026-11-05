"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SidebarAction({
  compact = false,
  tooltip,
  tooltipDisabled = false,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  compact?: boolean;
  tooltip?: ReactNode;
  tooltipDisabled?: boolean;
}) {
  const button = (
    <Button
      variant="ghost"
      size={compact ? "icon" : "default"}
      className={cn(
        "sidebar-action flex h-9 gap-3 [&_svg]:size-3.5",
        compact
          ? "mx-auto my-0.5 h-8 w-8 justify-center px-0"
          : "w-full justify-start px-3",
        className,
      )}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip disabled={tooltipDisabled}>
      <TooltipTrigger render={button} delay={300} />
      <TooltipContent side="right" sideOffset={10}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

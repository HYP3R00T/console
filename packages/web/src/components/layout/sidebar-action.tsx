"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SidebarAction({
  compact = false,
  className,
  ...props
}: ComponentProps<typeof Button> & { compact?: boolean }) {
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "default"}
      className={cn(
        "flex h-9 gap-3 [&_svg]:size-4",
        compact
          ? "mx-auto my-0.5 h-8 w-8 justify-center px-0"
          : "w-full justify-start px-3",
        className,
      )}
      {...props}
    />
  );
}

"use client";

import { ChevronRight, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SettingsHeading({
  title,
  description,
  help,
  icon: Icon,
}: {
  title: string;
  description: string;
  help?: string;
  icon: LucideIcon;
}) {
  return (
    <header className="flex items-start gap-3">
      <Icon
        className="mt-1 size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{title}</h1>
          {help && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`About ${title}`}
                  />
                }
              >
                <Info />
              </TooltipTrigger>
              <TooltipContent>{help}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}

export function SettingsDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group justify-start"
          />
        }
      >
        <ChevronRight className="group-aria-expanded:rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex min-w-0 flex-col gap-4 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

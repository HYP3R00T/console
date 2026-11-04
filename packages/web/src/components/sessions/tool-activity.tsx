"use client";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** Same disclosure for persisted calls, bounded results and failures. */
export function ToolActivity({
  label,
  content,
  failed = false,
}: {
  label: string;
  content: string;
  failed?: boolean;
}) {
  return (
    <Collapsible className="text-xs text-muted-foreground">
      <CollapsibleTrigger
        className="group flex items-center gap-2 py-1 text-left"
        aria-label={label}
      >
        <ChevronRight className="size-3 shrink-0 group-data-[panel-open]:rotate-90" />
        <span className={failed ? "text-destructive" : ""}>{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted/30 p-3">
          {content}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

"use client";

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Conversation } from "@/lib/api";
import { contextEstimate } from "@/lib/chat/context-usage";

export function ContextUsage({
  usage,
  online,
}: {
  usage?: Conversation["contextUsage"];
  online: boolean;
}) {
  const estimate = contextEstimate(usage);
  const label = estimate
    ? `Estimated context: ${estimate.label} used${online ? "" : " · cached"}`
    : "Context estimate unavailable";
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        title={label}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
            className="opacity-20"
          />
          {estimate && (
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2.5"
              pathLength="100"
              strokeDasharray={`${estimate.fill} 100`}
              transform="rotate(-90 12 12)"
            />
          )}
        </svg>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 gap-3 rounded-xl p-4 shadow-xl"
      >
        <PopoverTitle className="text-xs">Context usage</PopoverTitle>
        {estimate ? (
          <>
            <p className="text-xs">
              <span className="font-medium">{estimate.label}</span> of the
              context window
            </p>
            <progress
              aria-label="Estimated saved context usage"
              className="h-1.5 w-full accent-foreground"
              max={estimate.capacity}
              value={Math.min(estimate.used, estimate.capacity)}
            />
            <p className="text-xs text-muted-foreground">
              {estimate.used.toLocaleString()} /{" "}
              {estimate.capacity.toLocaleString()} tokens
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Saved conversation estimate. Model changes apply on Send; this is
              not billing usage.
              {!online && " Connection unavailable; showing cached data."}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            This backend has not provided a context estimate.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

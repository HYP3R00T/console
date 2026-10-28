"use client";

import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { ReasoningPart } from "@/lib/console-api";

function ReasoningRow({ text, streaming }: ReasoningPart) {
  const [open, setOpen] = useState<boolean>();
  const line = (
    <TraceLine status={streaming ? "running" : undefined}>
      <TraceIcon>
        {streaming ? (
          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
        ) : (
          <CircleCheckIcon />
        )}
      </TraceIcon>
      <TraceTitle>{streaming ? "Thinking" : "Thought"}</TraceTitle>
    </TraceLine>
  );
  if (!text) return line;
  return (
    <TraceCollapsible open={open ?? streaming} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap text-sm">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function MessageReasoning({ parts }: { parts?: ReasoningPart[] }) {
  if (!parts?.length) return null;
  return (
    <Trace>
      {parts.map((part) => (
        <ReasoningRow key={part.id} {...part} />
      ))}
    </Trace>
  );
}

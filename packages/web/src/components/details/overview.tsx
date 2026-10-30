"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { ConversationRuntime } from "@/components/details/runtime";
import type { Conversation } from "@/lib/api";

export function SessionInspector({
  session,
  disabled,
  modelName,
}: {
  session: Conversation;
  disabled: boolean;
  modelName?: string;
}) {
  const path = `/sessions/${session.id}${session.conversationId ? `/conversations/${session.conversationId}` : ""}`;
  const running = session.status === "running";
  return (
    <section
      className="space-y-4 p-4 text-xs"
      aria-label="Conversation summary"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={`size-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
        />
        <span className={session.status === "idle" ? "" : "capitalize"}>
          {session.status === "idle"
            ? "Ready for your message"
            : session.status}
        </span>
      </div>
      {!!session.plan?.steps.length && (
        <section
          aria-label="Conversation plan"
          className="space-y-3 rounded-xl border border-border/60 p-3"
        >
          <h3 className="font-medium">{session.plan.title}</h3>
          <ol className="space-y-2.5">
            {session.plan.steps.map((step) => {
              const Icon =
                step.status === "completed"
                  ? CheckIcon
                  : step.status === "in_progress"
                    ? LoaderCircleIcon
                    : CircleIcon;
              return (
                <li key={step.step} className="flex items-start gap-2.5">
                  <Icon
                    aria-label={step.status.replaceAll("_", " ")}
                    className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground ${step.status === "in_progress" ? "animate-spin motion-reduce:animate-none" : ""}`}
                  />
                  <span>{step.step}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <details className="group rounded-xl border border-border/60">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-medium [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Usage & context</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t p-3">
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Saved model</dt>
              <dd className="text-right">
                {modelName ?? session.model?.modelId ?? "Not selected"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Saved thinking</dt>
              <dd className="capitalize">{session.thinkingLevel}</dd>
            </div>
          </dl>
          <ConversationRuntime
            session={session}
            path={path}
            disabled={disabled}
          />
        </div>
      </details>
    </section>
  );
}

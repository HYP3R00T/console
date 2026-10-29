"use client";

import {
  BrainIcon,
  CircleCheckIcon,
  CircleIcon,
  FileTextIcon,
  FolderSearchIcon,
  InfoIcon,
  LoaderCircleIcon,
  RouteIcon,
  TerminalIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import {
  type ActivityStep,
  parsePlan,
  type ToolActivity,
  type TranscriptBlock,
  toolOutput,
  toolTitle,
} from "@/lib/chat-transcript";
import type { Conversation } from "@/lib/console-api";

function ToolIcon({ tool }: { tool: ToolActivity }) {
  if (tool.status === "error") return <TriangleAlertIcon />;
  if (["bash", "run_command"].includes(tool.name)) return <TerminalIcon />;
  if (["read", "read_file", "write", "write_file", "edit"].includes(tool.name))
    return <FileTextIcon />;
  if (tool.name === "list_directory") return <FolderSearchIcon />;
  if (tool.name === "update_plan") return <RouteIcon />;
  return <WrenchIcon />;
}

function ActivityRow({
  step,
  onInspect,
}: {
  step: ActivityStep;
  onInspect: () => void;
}) {
  const [open, setOpen] = useState<boolean>();
  const tool = step.kind === "tool" ? step : undefined;
  const running = tool
    ? tool.status === "running" || tool.status === "pending"
    : step.kind !== "tool" && step.streaming;
  const failed = tool?.status === "error";
  const stateLabel = !tool
    ? ""
    : failed
      ? "Failed"
      : tool.status === "done"
        ? "Done"
        : tool.status === "recorded"
          ? "Recorded call; output shown separately"
          : tool.status === "interrupted"
            ? "No result recorded"
            : "Running";
  return (
    <TraceCollapsible
      data-message-id={step.messageIds[0]}
      data-message-ids={step.messageIds.join(",")}
      open={open ?? Boolean(running && tool?.output)}
      onOpenChange={(value) => {
        onInspect();
        setOpen(value);
      }}
    >
      <TraceCollapsibleTrigger>
        <TraceLine status={failed ? "error" : running ? "running" : undefined}>
          <TraceIcon>
            {tool ? (
              <ToolIcon tool={tool} />
            ) : step.kind === "reasoning" ? (
              <BrainIcon />
            ) : (
              <InfoIcon />
            )}
          </TraceIcon>
          <TraceTitle>
            {tool
              ? `${tool.resultOnly ? "Output · " : ""}${toolTitle(tool)}`
              : step.kind === "reasoning"
                ? "Reasoning"
                : "Agent note"}
          </TraceTitle>
          {tool && (
            <TraceDescription title={stateLabel}>
              {failed ? (
                "Failed"
              ) : (
                <>
                  <span className="sr-only">{stateLabel}</span>
                  {tool.status === "done" ? (
                    <CircleCheckIcon className="size-3" aria-hidden="true" />
                  ) : tool.status === "recorded" ? (
                    <InfoIcon className="size-3" aria-hidden="true" />
                  ) : tool.status === "interrupted" ? (
                    <CircleIcon className="size-3" aria-hidden="true" />
                  ) : (
                    <LoaderCircleIcon
                      className="size-3 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                </>
              )}
            </TraceDescription>
          )}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        {tool ? (
          <div className="space-y-3 text-xs">
            {tool.arguments && (
              <div>
                <p className="mb-1 text-muted-foreground">Input</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word rounded-none bg-muted/30 p-3">
                  {JSON.stringify(tool.arguments, null, 2)}
                </pre>
              </div>
            )}
            {tool.output !== undefined ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap wrap-break-word rounded-none bg-muted/30 p-3 font-mono leading-5">
                {toolOutput(tool.output) || "No output."}
              </pre>
            ) : (
              <p>
                {tool.status === "recorded"
                  ? "This older server records outputs separately; inspect the output rows below."
                  : running
                    ? "Running. Output appears here when the tool publishes it."
                    : "No output has been recorded for this call."}
              </p>
            )}
          </div>
        ) : (
          <div className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-6">
            {step.kind !== "tool" ? step.text : ""}
          </div>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function RecordedPlan({
  plan,
  running,
  onInspect,
}: {
  plan: NonNullable<Conversation["plan"]>;
  running: boolean;
  onInspect: () => void;
}) {
  const [open, setOpen] = useState<boolean>();
  if (!plan.steps.length) return null;
  const done = plan.steps.filter((step) => step.status === "completed").length;
  const active =
    running && plan.steps.some((step) => step.status === "in_progress");
  return (
    <Trace className="mb-3">
      <TraceCollapsible
        open={open ?? active}
        onOpenChange={(value) => {
          onInspect();
          setOpen(value);
        }}
      >
        <TraceCollapsibleTrigger>
          <TraceLine status={active ? "running" : undefined}>
            <TraceIcon>
              <RouteIcon />
            </TraceIcon>
            <TraceTitle>{plan.title}</TraceTitle>
            <TraceDescription>
              {done}/{plan.steps.length}
            </TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="max-h-64 overflow-y-auto">
          <Trace>
            {plan.steps.map((step) => (
              <TraceLine
                key={step.step}
                status={
                  step.status === "pending"
                    ? "pending"
                    : step.status === "in_progress" && active
                      ? "running"
                      : undefined
                }
              >
                <TraceIcon>
                  {step.status === "completed" ? (
                    <CircleCheckIcon />
                  ) : step.status === "in_progress" && active ? (
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <CircleIcon />
                  )}
                </TraceIcon>
                <span className="min-w-0 text-xs">{step.step}</span>
                <span className="sr-only">
                  {step.status.replaceAll("_", " ")}
                </span>
              </TraceLine>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

export function ChatActivity({
  block,
  running,
  plan: savedPlan,
  onInspect,
}: {
  block: Extract<TranscriptBlock, { kind: "activity" }>;
  running: boolean;
  plan?: Conversation["plan"];
  onInspect: () => void;
}) {
  const [open, setOpen] = useState<boolean>();
  const tools = block.steps.filter(
    (step): step is ToolActivity => step.kind === "tool",
  );
  const errors = tools.filter((tool) => tool.status === "error");
  const actionCount =
    tools.filter((tool) => !tool.resultOnly).length || tools.length;
  const incomplete = tools.some((tool) => tool.status === "interrupted");
  const active =
    running &&
    (tools.some((tool) => ["running", "pending"].includes(tool.status)) ||
      block.steps.some((step) => step.kind !== "tool" && step.streaming));
  const current = tools.find((tool) =>
    ["running", "pending"].includes(tool.status),
  );
  const recentPlan = [...tools]
    .reverse()
    .find(
      (tool) =>
        tool.name === "update_plan" &&
        tool.status === "done" &&
        tool.output !== undefined,
    );
  const plan =
    savedPlan && block.messageIds.includes(`${savedPlan.sourceEntryId}-0`)
      ? savedPlan
      : recentPlan?.output
        ? parsePlan(recentPlan.output)
        : undefined;
  return (
    <div
      className="mx-auto max-w-3xl"
      data-message-id={block.messageIds[0]}
      data-message-ids={block.messageIds.join(",")}
    >
      {plan && (
        <RecordedPlan plan={plan} running={running} onInspect={onInspect} />
      )}
      <Trace>
        <TraceCollapsible
          open={open ?? (active || errors.length > 0)}
          onOpenChange={(value) => {
            onInspect();
            setOpen(value);
          }}
        >
          <TraceCollapsibleTrigger>
            <TraceLine
              status={errors.length ? "error" : active ? "running" : undefined}
            >
              <TraceIcon>
                {errors.length ? (
                  <TriangleAlertIcon />
                ) : active ? (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                ) : incomplete ? (
                  <CircleIcon />
                ) : (
                  <WrenchIcon />
                )}
              </TraceIcon>
              <TraceTitle>
                {active
                  ? current
                    ? toolTitle(current)
                    : "Thinking"
                  : tools.length
                    ? `${actionCount} ${actionCount === 1 ? "action" : "actions"}`
                    : "Reasoning and notes"}
              </TraceTitle>
              {errors.length > 0 && (
                <TraceDescription>{errors.length} failed</TraceDescription>
              )}
              {incomplete && (
                <TraceDescription>Incomplete record</TraceDescription>
              )}
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="max-h-96 overflow-y-auto">
            <Trace>
              {block.steps.map((step) => (
                <ActivityRow key={step.id} step={step} onInspect={onInspect} />
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  );
}

export function ContextEntry({
  message,
  onInspect,
}: {
  message: Conversation["messages"][number];
  onInspect: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl" data-message-id={message.id}>
      <Trace>
        <TraceCollapsible onOpenChange={onInspect}>
          <TraceCollapsibleTrigger>
            <TraceLine>
              <TraceIcon>
                <InfoIcon />
              </TraceIcon>
              <TraceTitle>
                {message.kind === "pi.compaction"
                  ? "Context summarized"
                  : "Context handoff"}
              </TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <ChatMarkdown text={message.text} />
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  );
}

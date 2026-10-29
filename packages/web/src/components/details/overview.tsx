"use client";

import { CheckIcon, CircleIcon, LoaderCircleIcon } from "lucide-react";
import type { InspectorPanel } from "@/components/details/agent-panels";
import { ConversationRuntime } from "@/components/details/runtime";
import { SandboxSettings } from "@/components/details/sandbox";
import { ProjectResources } from "@/components/projects/resources";
import type { Conversation, SandboxPolicy } from "@/lib/api";

export function SessionInspector({
  session,
  panel,
  disabled,
  onSandboxSave,
  onSandboxDirtyChange,
  onResourcePrompt,
}: {
  session: Conversation;
  panel: InspectorPanel;
  disabled: boolean;
  onSandboxSave: (policy: SandboxPolicy) => Promise<void>;
  onSandboxDirtyChange: (dirty: boolean) => void;
  onResourcePrompt: (text: string) => void;
}) {
  const path = `/sessions/${session.id}${session.conversationId ? `/conversations/${session.conversationId}` : ""}`;
  const usage = session.contextUsage;
  const cost = Object.values(session.usage?.models ?? {}).reduce(
    (sum, item) => sum + item.cost.total,
    0,
  );
  return (
    <section className="px-4 text-sm" aria-label="Conversation details">
      <section hidden={panel !== "session"} className="space-y-4 py-4">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1 capitalize">{session.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Recorded cost</dt>
            <dd className="mt-1">${cost.toFixed(4)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="mt-1 break-all">
              {session.model
                ? `${session.model.provider}/${session.model.modelId}`
                : "Not selected"}{" "}
              · {session.thinkingLevel}
            </dd>
          </div>
          {usage && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Estimated context</dt>
              <dd className="mt-1">
                {usage.estimatedTokens.toLocaleString()} /{" "}
                {usage.capacity.toLocaleString()} tokens
              </dd>
            </div>
          )}
        </dl>
        {session.plan?.steps.length ? (
          <section
            className="space-y-3 border-t pt-4"
            aria-label="Conversation plan"
          >
            <h3 className="text-xs font-medium">{session.plan.title}</h3>
            <ol className="space-y-2">
              {session.plan.steps.map((step) => {
                const Icon =
                  step.status === "completed"
                    ? CheckIcon
                    : step.status === "in_progress"
                      ? LoaderCircleIcon
                      : CircleIcon;
                return (
                  <li
                    key={step.step}
                    className="flex items-start gap-2 text-xs"
                  >
                    <Icon
                      className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                      aria-label={step.status.replaceAll("_", " ")}
                    />
                    <span>{step.step}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            No recorded plan.
          </p>
        )}
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-xs font-medium">
            Usage and context controls
          </summary>
          <ConversationRuntime
            session={session}
            path={path}
            disabled={disabled}
          />
        </details>
      </section>
      <section hidden={panel !== "tools"} className="space-y-4 py-4">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Sandbox</dt>
            <dd className="mt-1">
              {session.sandbox.enabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Network</dt>
            <dd className="mt-1 capitalize">
              {session.sandbox.enabled
                ? session.sandbox.network
                : "No tool access"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Commands</dt>
            <dd className="mt-1">
              {session.sandbox.enabled && session.sandbox.commands
                ? "Allowed"
                : "Disabled"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">File writes</dt>
            <dd className="mt-1">
              {session.sandbox.enabled && session.sandbox.writePaths.length
                ? "Granted paths"
                : "Disabled"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="mt-1 break-all">
              {session.sandbox.workspace || "Not set"}
            </dd>
          </div>
        </dl>
        <SandboxSettings
          policy={session.sandbox}
          fixedWorkspace={Boolean(session.workspaceId)}
          disabled={disabled}
          onSave={onSandboxSave}
          onDirtyChange={onSandboxDirtyChange}
        />
      </section>
      <section hidden={panel !== "extend"} className="py-4">
        <details>
          <summary className="cursor-pointer text-xs font-medium">
            Project instructions, skills and prompts
          </summary>
          <p className="py-2 text-xs text-muted-foreground">
            Project files available through this conversation’s access policy.
          </p>
          <ProjectResources
            session={session}
            path={path}
            onUse={onResourcePrompt}
          />
        </details>
      </section>
    </section>
  );
}

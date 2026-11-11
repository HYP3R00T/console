"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { InspectorCode } from "./inspector-code";
import {
  InspectorSection,
  InspectorSectionContent,
  InspectorSectionHeader,
  InspectorSectionTitle,
} from "./inspector-section";

type Parameters = {
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
};

export type InspectorTool = {
  name: string;
  extension: string;
  description: string;
  parameters: Parameters;
  enabled: boolean;
  deferred?: boolean;
};
const toolGroups: Record<string, string> = {
  "coding-tools": "Coding",
  "console.advanced-tools": "Code Mode and discovery",
  "console.mcp": "MCP",
  "console.review": "Reviews",
  "console.agent-controls": "Background agents",
};
const purposes: Record<string, string> = {
  read: "Read a text file or inspect an image.",
  write: "Create or overwrite a file.",
  edit: "Replace matching text in an existing file.",
  bash: "Run shell commands with the backend user’s permissions.",
};

function ToolParameters({ tool }: { tool: InspectorTool }) {
  const [showJson, setShowJson] = useState(false);
  const fields = Object.entries(tool.parameters.properties ?? {});
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-muted/50 p-3">
      <p className="leading-normal text-muted-foreground">
        {purposes[tool.name] ?? tool.description}
      </p>
      <h4 className="font-medium">Call parameters</h4>
      {fields.length > 0 && (
        <dl className="flex min-w-0 flex-col gap-2">
          {fields.map(([name, field]) => (
            <div key={name} className="flex min-w-0 flex-col gap-0.5">
              <dt className="flex flex-wrap items-baseline gap-x-2">
                <code className="wrap-anywhere">{name}</code>
                <span className="text-muted-foreground">
                  {field.type && (
                    <code className="rounded-sm bg-muted px-1 text-foreground">
                      {field.type}
                    </code>
                  )}{" "}
                  (
                  {tool.parameters.required?.includes(name)
                    ? "required"
                    : "optional"}
                  )
                </span>
              </dt>
              {field.description && (
                <dd className="wrap-anywhere text-muted-foreground">
                  {field.description}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      <Button
        className="self-start"
        size="xs"
        variant="outline"
        aria-expanded={showJson}
        onClick={() => setShowJson(!showJson)}
      >
        {showJson ? "Hide JSON schema" : "View JSON schema"}
      </Button>
      {showJson && (
        <InspectorCode
          code={JSON.stringify(tool.parameters, null, 2)}
          language="json"
          label={`${tool.name} input schema`}
        />
      )}
    </div>
  );
}

export function InspectorTools({
  tools,
  custom,
  working,
  saving,
  planMode = false,
  update,
}: {
  tools: InspectorTool[];
  custom: boolean;
  working: boolean;
  saving: boolean;
  planMode?: boolean;
  update: (tools: string[] | null) => void;
}) {
  const disabled = saving || working || planMode;
  const enabled = tools.filter((tool) => tool.enabled).map((tool) => tool.name);
  const groups = [...new Set(tools.map((tool) => tool.extension))];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          {planMode
            ? "Tool access is fixed while Plan mode is active."
            : working
              ? "Tool access can be changed when this chat is idle."
              : "Tool access for this conversation."}
        </p>
        {custom && !planMode && (
          <Button
            variant="outline"
            size="xs"
            disabled={disabled}
            onClick={() => update(null)}
          >
            Enable all
          </Button>
        )}
      </div>
      {groups.map((extension) => (
        <InspectorSection key={extension}>
          <InspectorSectionHeader>
            <InspectorSectionTitle>
              {toolGroups[extension] ?? extension}
            </InspectorSectionTitle>
          </InspectorSectionHeader>
          <InspectorSectionContent>
            <ul className="flex min-w-0 flex-col gap-1">
              {tools
                .filter((tool) => tool.extension === extension)
                .map((tool) => (
                  <li key={tool.name}>
                    <Collapsible className="group/tool flex min-w-0 flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <CollapsibleTrigger
                          render={<Button variant="ghost" size="xs" />}
                          className="-ml-2 min-w-0 flex-1 justify-start whitespace-normal"
                          aria-label={`Details for ${tool.name}`}
                        >
                          <ChevronRight
                            data-icon="inline-start"
                            aria-hidden
                            className="group-data-panel-open/tool:rotate-90"
                          />
                          <code className="wrap-anywhere">{tool.name}</code>
                          {tool.deferred && (
                            <span className="text-muted-foreground">
                              Discoverable
                            </span>
                          )}
                        </CollapsibleTrigger>
                        <Switch
                          size="sm"
                          aria-label={`Enable ${tool.name}`}
                          checked={enabled.includes(tool.name)}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            update(
                              checked
                                ? [...enabled, tool.name]
                                : enabled.filter((name) => name !== tool.name),
                            )
                          }
                        />
                      </div>
                      <CollapsibleContent className="min-w-0 pt-1">
                        <ToolParameters tool={tool} />
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                ))}
            </ul>
          </InspectorSectionContent>
        </InspectorSection>
      ))}
    </>
  );
}

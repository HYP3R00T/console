import type { Draft } from "@earendil-works/chord";
import {
  type CodemodeRunOptions,
  CodemodeSandbox,
} from "@earendil-works/pi-codemode";
import {
  type AgentState,
  defineExtension,
  wrapTool,
} from "@earendil-works/pi-durable";
import {
  CODEMODE_TOOL_NAME,
  createCodemodeExtension,
} from "@earendil-works/pi-durable/codemode";
import {
  createToolSearchTool,
  TOOL_SEARCH_TOOL_NAME,
} from "@earendil-works/pi-durable/tool-search";
import { reviewWorkspace } from "./reviewer.ts";

export const advancedToolsName = "console.advanced-tools";
const names = [CODEMODE_TOOL_NAME, TOOL_SEARCH_TOOL_NAME];
const maxScriptMs = 30_000;

class BoundedCodemodeSandbox extends CodemodeSandbox {
  override start(code: string, options: CodemodeRunOptions) {
    return super.start(code, {
      ...options,
      timeoutMs: Math.min(options.timeoutMs ?? maxScriptMs, maxScriptMs),
    });
  }
}

export function codeModeCalls(details: unknown) {
  if (
    !details ||
    typeof details !== "object" ||
    !("calls" in details) ||
    !Array.isArray(details.calls)
  )
    return [];
  return details.calls.flatMap((call: unknown) => {
    if (
      !call ||
      typeof call !== "object" ||
      !("name" in call) ||
      !("status" in call) ||
      typeof call.name !== "string" ||
      typeof call.status !== "string"
    )
      return [];
    return [{ name: call.name, status: call.status }];
  });
}

export function createAdvancedTools() {
  const sandbox = new BoundedCodemodeSandbox({
    memoryLimitBytes: 64 * 1024 * 1024,
  });
  const code = createCodemodeExtension({ sandbox, models: false });
  const extension = defineExtension({
    name: advancedToolsName,
    tools: [...(code.tools ?? []), createToolSearchTool()],
    sections: code.sections,
    wraps: [wrapTool(reviewWorkspace, (tool) => ({ ...tool, deferred: true }))],
  });
  return { extension, close: () => sandbox.close() };
}

/** Change only the opt-in extension and its two tools, preserving existing allowlists. */
export function selectAdvancedTools(
  agent: Draft<AgentState>,
  enabled: boolean,
  keepDiscovery: boolean,
) {
  selectExtensionTools(
    agent,
    advancedToolsName,
    !enabled && keepDiscovery ? [CODEMODE_TOOL_NAME] : names,
    enabled,
  );
}

export function selectExtensionTools(
  agent: Draft<AgentState>,
  extension: string,
  names: string[],
  enabled: boolean,
  eager = names,
) {
  const extensionNames = (list: string[] = []) => {
    const rest = list.filter((name) => name !== extension);
    return enabled ? [...rest, extension] : rest;
  };
  const toolNames = (list: string[]) => {
    const rest = list.filter((name) => !names.includes(name));
    return enabled ? [...rest, ...names] : rest;
  };
  if (Array.isArray(agent.extensions)) {
    agent.extensions = extensionNames(agent.extensions);
  } else {
    const add = extensionNames(agent.extensions?.add);
    const remove = agent.extensions?.remove?.filter(
      (name) => name !== extension,
    );
    if (add.length || remove?.length) {
      agent.extensions = {
        ...(add.length && { add }),
        ...(remove?.length && { remove }),
      };
    } else {
      delete agent.extensions;
    }
  }
  if (Array.isArray(agent.tools)) agent.tools = toolNames(agent.tools);
  else if (enabled && agent.tools)
    agent.tools = {
      remove: agent.tools.remove.filter((name) => !names.includes(name)),
    };
  if (Array.isArray(agent.modelTools)) {
    const rest = agent.modelTools.filter((name) => !names.includes(name));
    agent.modelTools = enabled ? [...rest, ...eager] : rest;
  } else if (enabled && agent.modelTools?.remove)
    agent.modelTools.remove = agent.modelTools.remove.filter(
      (name) => !names.includes(name),
    );
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationConfigurationSchema,
  runtimePolicySchema,
} from "../../contracts/src/index.ts";
import { capabilities, searchCapabilities } from "../src/lib/capabilities.ts";
import {
  slashCommands,
  slashSuggestions,
} from "../src/lib/command-registry.ts";
import { commands, defaultShortcut } from "../src/lib/commands.ts";
import {
  inspectorSections,
  parseInspectorSelection,
} from "../src/lib/inspector-preferences.ts";

test("the capability directory has unique identities, explicit ownership and valid entry points", () => {
  assert.equal(
    new Set(capabilities.map((entry) => entry.id)).size,
    capabilities.length,
  );
  for (const entry of capabilities) {
    for (const value of [
      entry.id,
      entry.label,
      entry.description,
      entry.location,
      entry.effect,
    ])
      assert.ok(value.trim(), entry.id);
    if (entry.command) assert.ok(entry.command in commands, entry.id);
  }
  for (const section of inspectorSections) {
    assert.deepEqual(
      parseInspectorSelection({ scope: "conversation", section }),
      { scope: "conversation", section },
    );
    const id = `inspector.${section}` as keyof typeof commands;
    assert.ok(id in commands, section);
    assert.equal(defaultShortcut(id), null);
  }
});

test("every conversation write field is placed in its owning capability destination", () => {
  const destinations: Record<string, string> = {
    tools: "conversation.tools",
    managedExtensions: "integrations.managedExtensions",
    instructions: "instructions.text",
    projectTools: "project.projectTools",
    projectInstructions: "project.projectInstructions",
    workspaceGuidance: "guidance.workspaceGuidance",
    inspectionGuidance: "project.inspectionGuidance",
    runtimePolicy: "session.toolExecution",
    automaticCompaction: "session.automaticCompaction",
    planMode: "conversation.planMode",
    sandbox: "workspace.sandbox",
    remoteProfile: "workspace.remoteProfile",
    codeMode: "integrations.codeMode",
    mcp: "integrations.mcp",
    postRunRepairLimit: "checks.postRunRepairLimit",
    postRunCommand: "checks.postRunCommand",
    maxTurns: "context.maxTurns",
    tokenBudget: "session.tokenBudget",
    worktree: "workspace.worktree",
    keepRecentTokens: "session.keepRecentTokens",
  };
  for (const key of Object.keys(
    conversationConfigurationSchema.properties,
  ).filter((key) => key !== "revision")) {
    assert.ok(destinations[key], `Unmapped API setting ${key}`);
    assert.ok(
      capabilities.some((entry) => entry.id === destinations[key]),
      `Missing directory entry ${destinations[key]}`,
    );
  }
});

test("runtime policy schema leaves including per-model fields remain discoverable", () => {
  function leaves(
    schema: { properties?: Record<string, unknown> },
    prefix = "",
  ): string[] {
    return Object.entries(schema.properties ?? {}).flatMap(([key, value]) => {
      const path = prefix + key;
      if (path === "compaction.modelOverrides") return [];
      return typeof value === "object" && value && "properties" in value
        ? leaves(value as { properties: Record<string, unknown> }, `${path}.`)
        : [path];
    });
  }
  for (const key of leaves(runtimePolicySchema))
    assert.ok(
      capabilities.some((entry) => entry.id === `session.${key}`),
      key,
    );
  for (const key of [
    "enabled",
    "reserveTokens",
    "backgroundTokens",
    "keepRecentTokens",
  ])
    assert.ok(
      capabilities.some(
        (entry) => entry.id === `session.modelOverrides.${key}`,
      ),
    );
});

test("plain vocabulary finds a scoped control and slash entry points use known unbound commands", () => {
  assert.ok(
    searchCapabilities("sandbox").some(
      (entry) => entry.id === "workspace.sandbox",
    ),
  );
  assert.ok(searchCapabilities("retry", "session").length);
  assert.ok(
    searchCapabilities("MCP", "machine").every(
      (entry) => entry.scope === "machine",
    ),
  );
  assert.deepEqual(searchCapabilities("no-such-capability-123"), []);
  for (const [alias, id] of Object.entries(slashCommands)) {
    assert.ok(id in commands);
    assert.ok(
      slashSuggestions(alias, false).some(
        ([name, command]) => name === alias && command === id,
      ),
    );
    assert.deepEqual(slashSuggestions(alias, true), []);
  }
});

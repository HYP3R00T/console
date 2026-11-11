import assert from "node:assert/strict";
import test from "node:test";
import { inspectorSectionAvailable } from "../src/lib/inspector-availability.ts";
import { inspectorSections } from "../src/lib/inspector-preferences.ts";

test("legacy configuration retains its editors and explains unavailable newer destinations", () => {
  const legacy = { context: {} };
  for (const section of [
    "overview",
    "tools",
    "instructions",
    "context",
    "status",
  ] as const)
    assert.equal(inspectorSectionAvailable(section, legacy), true, section);
  for (const section of [
    "workspace",
    "integrations",
    "tasks",
    "agents",
    "checks",
  ] as const)
    assert.equal(inspectorSectionAvailable(section, legacy), false, section);
  for (const section of inspectorSections)
    assert.equal(inspectorSectionAvailable(section), false, section);
});

test("disabled features remain discoverable and all existing automation editors stay reachable", () => {
  const current = {
    context: {},
    worktree: null,
    sandbox: false,
    codeMode: false,
    mcp: { servers: [] },
    managedExtensions: { selected: [] },
    postRunCommand: null,
  };
  for (const section of inspectorSections)
    assert.equal(inspectorSectionAvailable(section, current), true, section);
  assert.equal(
    inspectorSectionAvailable("workspace", { remote: { profiles: [] } }),
    true,
  );
  assert.equal(
    inspectorSectionAvailable("integrations", { codeMode: false }),
    true,
  );
});

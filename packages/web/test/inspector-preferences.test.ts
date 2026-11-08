import assert from "node:assert/strict";
import test from "node:test";
import {
  availableInspectorSelection,
  inspectorPreferenceKey,
  parseInspectorSelection,
} from "../src/lib/inspector-preferences.ts";
import { parseNavigationMemory } from "../src/lib/navigation-memory.ts";

test("inspector selections survive serialization and remain isolated by backend, session and conversation", () => {
  const identities = [
    ["backend-a", "session-a", "1"],
    ["backend-b", "session-a", "1"],
    ["backend-a", "session-b", "1"],
    ["backend-a", "session-a", "2"],
  ] as const;
  const keys = identities.map(([backend, session, conversation]) =>
    inspectorPreferenceKey(backend, session, conversation),
  );
  assert.equal(new Set(keys).size, 4);
  const inspectors = {
    [keys[0]]: { scope: "project", section: "context" },
    [keys[1]]: { scope: "session", section: "tasks" },
    [keys[2]]: { scope: "conversation", section: "instructions" },
  };
  const restored = parseNavigationMemory(JSON.stringify({ inspectors }));
  assert.deepEqual(restored.inspectors, inspectors);
  assert.deepEqual(
    availableInspectorSelection(restored.inspectors?.[keys[3]], true),
    {
      scope: "conversation",
      section: "tools",
    },
  );
});

test("standalone sessions and unavailable or corrupt selections have usable defaults", () => {
  const saved = { scope: "project", section: "context" } as const;
  assert.deepEqual(availableInspectorSelection(saved, false), {
    scope: "conversation",
    section: "context",
  });
  assert.deepEqual(saved, { scope: "project", section: "context" });
  for (const value of [
    null,
    [],
    1,
    {},
    { scope: "machine", section: "tools" },
    { scope: "session", section: "unknown" },
  ]) {
    assert.equal(parseInspectorSelection(value), undefined);
  }
  assert.deepEqual(
    parseNavigationMemory(
      JSON.stringify({
        inspectors: {
          bad: { scope: "unknown", section: "context" },
          good: saved,
        },
      }),
    ).inspectors,
    { good: saved },
  );
});

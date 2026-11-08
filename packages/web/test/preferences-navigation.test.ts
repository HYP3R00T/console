import assert from "node:assert/strict";
import test from "node:test";
import { commandWorksInEditor } from "../src/lib/commands.ts";
import {
  conversationSettingsHref,
  isPreferencesPath,
  machinePreferenceCategory,
  machinePreferenceHref,
  machinePreferencePages,
  preferenceMachine,
  preferencesHref,
  preferenceTarget,
} from "../src/lib/preferences-navigation.ts";

test("every context opens Appearance by default and retains only valid target ancestry", () => {
  assert.equal(preferencesHref(), "/settings/appearance");
  assert.equal(
    preferencesHref({
      projectId: "orphan",
      sessionId: "orphan",
      conversationId: "1",
    }),
    "/settings/appearance",
  );
  const target = {
    deviceId: "machine",
    projectId: "project",
    sessionId: "session",
    conversationId: "1",
  };
  const url = new URL(preferencesHref(target), "http://localhost");
  assert.equal(url.pathname, "/settings/appearance");
  assert.deepEqual(preferenceTarget({}, url.searchParams), target);
  assert.equal(
    preferencesHref({ deviceId: "machine", conversationId: "orphan" }),
    "/settings/appearance?machine=machine",
  );
});
test("client categories preserve the selected machine and route parameters override query targets", () => {
  const target = {
    deviceId: "machine",
    projectId: "project",
    sessionId: "session",
    conversationId: "1",
  };
  const url = new URL(
    preferencesHref(target, "/settings/shortcuts"),
    "http://localhost",
  );
  assert.equal(url.pathname, "/settings/shortcuts");
  assert.deepEqual(preferenceTarget({}, url.searchParams), target);
  assert.equal(
    preferenceTarget({ deviceId: "actual" }, url.searchParams).deviceId,
    "actual",
  );
  assert.deepEqual(
    preferenceTarget({}, new URLSearchParams("project=orphan&conversation=1")),
    {},
  );
});
test("every configuration destination uses the shared Preferences navigation", () => {
  for (const path of [
    "/settings",
    "/settings/appearance",
    "/devices/m/settings/providers",
    "/devices/m/projects/p/settings",
    "/devices/m/sessions/s/settings",
    conversationSettingsHref("m", "s", 1),
  ])
    assert.equal(isPreferencesPath(path), true, path);
  for (const path of [
    "/",
    "/devices",
    "/devices/m/projects/p",
    "/devices/m/conversations/s",
    "/devices/m/settings-other",
  ])
    assert.equal(isPreferencesPath(path), false, path);
  assert.equal(
    conversationSettingsHref("machine/name", "session/id", 1),
    "/devices/machine%2Fname/sessions/session%2Fid/conversations/1/settings",
  );
});
test("the Preferences shortcut works in text editors without enabling execution shortcuts there", () => {
  assert.equal(commandWorksInEditor("settings.open"), true);
  assert.equal(commandWorksInEditor("palette.open"), true);
  for (const id of [
    "conversation.stop",
    "conversation.continue",
    "conversation.new",
    "workspace.navigation",
  ] as const)
    assert.equal(commandWorksInEditor(id), false);
});

test("machine categories keep their destination while switching machines and clear previous workspace ancestry", () => {
  for (const page of machinePreferencePages) {
    const first = machinePreferenceHref(page.id, "machine/a");
    const second = machinePreferenceHref(page.id, "machine-b");
    assert.equal(first, `/devices/machine%2Fa/settings/${page.id}`);
    assert.equal(machinePreferenceCategory(first), page.id);
    assert.equal(machinePreferenceCategory(second), page.id);
    assert.equal(
      machinePreferenceCategory(machinePreferenceHref(page.id)),
      page.id,
    );
    assert.equal(second.includes("?"), false);
  }
  for (const path of [
    "/settings/appearance",
    "/devices/m/projects/p/settings",
    "/devices/m/settings/missing",
    "/settings/machines/missing",
  ])
    assert.equal(machinePreferenceCategory(path), undefined);
});

test("machine categories remain navigable without a saved selection", () => {
  const machines = [{ id: "a" }, { id: "b" }];
  assert.equal(preferenceMachine(machines, "b")?.id, "b");
  assert.equal(preferenceMachine(machines, "forgotten")?.id, "a");
  assert.equal(preferenceMachine(machines)?.id, "a");
  assert.equal(preferenceMachine([], "forgotten"), undefined);
  assert.equal(
    machinePreferenceHref("providers"),
    "/settings/machines/providers",
  );
});

test("palette settings destinations explicitly select existing editors without applying values", async () => {
  const { settingsDestinationHref, scopedSettingsDestinations } = await import(
    "../src/lib/preferences-navigation.ts"
  );
  assert.equal(
    settingsDestinationHref({
      destination: "machine:providers",
      target: { deviceId: "other" },
    }),
    "/devices/other/settings/providers",
  );
  assert.equal(
    settingsDestinationHref({
      destination: "session",
      target: { deviceId: "m", projectId: undefined, sessionId: "s" },
    }),
    "/devices/m/sessions/s/settings",
  );
  assert.equal(
    settingsDestinationHref({
      destination: "conversation",
      target: { deviceId: "m", sessionId: "s", conversationId: "2" },
    }),
    "/devices/m/sessions/s/conversations/2/settings",
  );
  assert.equal(scopedSettingsDestinations({ deviceId: "m" }).length, 10);
  for (const value of [
    null,
    { destination: "https://example.com", target: { deviceId: "m" } },
    { destination: "project", target: {} },
    { destination: "machine:providers", target: { deviceId: 42 } },
  ])
    assert.throws(() => settingsDestinationHref(value));
});

test("legacy integration category resolves to MCP without hiding SSH navigation", () => {
  assert.equal(
    machinePreferenceCategory("/devices/m/settings/integrations"),
    "mcp",
  );
  assert.equal(
    machinePreferenceCategory("/settings/machines/integrations"),
    "mcp",
  );
  assert.equal(machinePreferenceHref("ssh", "m"), "/devices/m/settings/ssh");
});

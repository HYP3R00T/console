import assert from "node:assert/strict";
import test from "node:test";
import { commandWorksInEditor } from "../src/lib/commands.ts";
import {
  conversationSettingsHref,
  isPreferencesPath,
  preferencesHref,
  preferenceTarget,
} from "../src/lib/preferences-navigation.ts";

test("every context opens the same Preferences hub and retains only valid target ancestry", () => {
  assert.equal(preferencesHref(), "/settings");
  assert.equal(
    preferencesHref({
      projectId: "orphan",
      sessionId: "orphan",
      conversationId: "1",
    }),
    "/settings",
  );
  const target = {
    deviceId: "machine",
    projectId: "project",
    sessionId: "session",
    conversationId: "1",
  };
  const url = new URL(preferencesHref(target), "http://localhost");
  assert.equal(url.pathname, "/settings");
  assert.deepEqual(preferenceTarget({}, url.searchParams), target);
  assert.equal(
    preferencesHref({ deviceId: "machine", conversationId: "orphan" }),
    "/settings?machine=machine",
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

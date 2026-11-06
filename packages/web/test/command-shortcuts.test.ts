import assert from "node:assert/strict";
import test from "node:test";
import {
  parseShortcuts,
  shortcutConflict,
  shortcutFor,
  shortcutFromEvent,
} from "../src/lib/commands.ts";

test("stored overrides can disable and replace a default without stealing another command's shortcut", () => {
  const overrides = parseShortcuts(
    JSON.stringify({
      "workspace.navigation": null,
      "conversation.new": "Mod+B",
      "palette.open": "Mod+Shift+P",
      unknown: "Mod+U",
    }),
  );
  assert.deepEqual(overrides, {
    "workspace.navigation": null,
    "conversation.new": "Mod+B",
    "palette.open": "Mod+Shift+P",
  });
  assert.equal(shortcutFor("workspace.navigation", overrides), null);
  assert.equal(
    shortcutConflict("workspace.navigation", "Mod+B", overrides),
    "conversation.new",
  );
  assert.deepEqual(parseShortcuts('{"conversation.new":"Mod+K"}'), {});
  assert.equal(shortcutFor("palette.open", parseShortcuts("invalid")), "Mod+K");
});

test("recording and dispatch normalize modifiers and reject editing or composition keystrokes", () => {
  const event = {
    key: "K",
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: true,
    isComposing: false,
    getModifierState: () => false,
  };
  assert.equal(shortcutFromEvent(event), "Mod+Shift+K");
  assert.equal(
    shortcutFromEvent({ ...event, ctrlKey: true, metaKey: false }),
    "Mod+Shift+K",
  );
  assert.equal(shortcutFromEvent({ ...event, ctrlKey: true }), undefined);
  assert.equal(shortcutFromEvent({ ...event, isComposing: true }), undefined);
  assert.equal(
    shortcutFromEvent({ ...event, getModifierState: () => true }),
    undefined,
  );
  assert.equal(
    shortcutFromEvent({ ...event, shiftKey: false, key: "v" }),
    undefined,
  );
});

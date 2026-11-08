import assert from "node:assert/strict";
import test from "node:test";
import {
  ariaShortcut,
  formatShortcut,
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

test("punctuation, Alt and shifted physical keys record and survive storage", () => {
  const event = {
    key: ",",
    code: "Comma",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    getModifierState: () => false,
  };
  assert.equal(shortcutFromEvent(event), "Mod+,");
  assert.equal(
    shortcutFromEvent({
      ...event,
      ctrlKey: false,
      altKey: true,
      shiftKey: true,
      key: "s",
      code: "KeyS",
    }),
    "Alt+Shift+S",
  );
  assert.equal(
    shortcutFromEvent({ ...event, key: "!", code: "Digit1", shiftKey: true }),
    "Mod+Shift+1",
  );
  assert.equal(
    shortcutFromEvent({ ...event, key: "Control", code: "ControlLeft" }),
    undefined,
  );
  assert.equal(
    shortcutFromEvent({ ...event, ctrlKey: false, shiftKey: true }),
    undefined,
  );
  assert.deepEqual(
    parseShortcuts(
      '{"settings.open":"Mod+,","conversation.new":"Alt+Shift+N"}',
    ),
    { "settings.open": "Mod+,", "conversation.new": "Alt+Shift+N" },
  );
});

test("shortcut labels show platform keys without exposing the portable storage token", () => {
  assert.equal(formatShortcut("Mod+B", "Linux x86_64"), "Ctrl + B");
  assert.equal(
    formatShortcut("Mod+Alt+Shift+,", "MacIntel"),
    "Command + Alt + Shift + ,",
  );
  assert.equal(formatShortcut("Alt+Shift+N", "Win32"), "Alt + Shift + N");
  assert.equal(formatShortcut(null, "Linux"), "Unassigned");
  assert.equal(ariaShortcut("Alt+Shift+N"), "Alt+Shift+N");
});

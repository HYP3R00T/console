import assert from "node:assert/strict";
import test from "node:test";
import {
  appearancePicker,
  applyAppearanceCommand,
} from "../src/lib/configuration/appearance-command.ts";
import { ConfigurationStore } from "../src/lib/configuration/store.ts";
import { ThemePreviewStore } from "../src/lib/configuration/theme-preview.ts";
import { defaultAppearance } from "../src/lib/configuration/themes.ts";

function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const store = new ConfigurationStore({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new Error("Storage full");
      values.set(key, value);
    },
  });
  return {
    store,
    values,
    fail: () => {
      fail = true;
    },
  };
}
test("theme commands preserve system mode and the latest opposite-mode default", () => {
  const { store } = fixture();
  applyAppearanceCommand(store, "appearance.light-theme", {
    mode: "light",
    themeId: "catppuccin-latte",
  });
  applyAppearanceCommand(store, "appearance.theme", {
    mode: "dark",
    themeId: "tokyo-night",
  });
  assert.deepEqual(store.appearance(), {
    mode: "system",
    lightTheme: "catppuccin-latte",
    darkTheme: "tokyo-night",
  });
  assert.deepEqual(appearancePicker("appearance.theme", "dark"), {
    kind: "theme",
    mode: "dark",
  });
  applyAppearanceCommand(store, "appearance.mode", "light");
  assert.equal(store.appearance().mode, "light");
});
test("invalid choices and failed storage never change confirmed appearance", () => {
  const f = fixture();
  f.store.saveAppearance({ ...defaultAppearance });
  const before = [...f.values];
  for (const [id, input] of [
    ["appearance.dark-theme", { mode: "light", themeId: "catppuccin-latte" }],
    ["appearance.theme", { mode: "dark", themeId: "missing" }],
    ["appearance.theme", { mode: "dark", themeId: "catppuccin-latte" }],
    ["appearance.mode", "invalid"],
  ] as const)
    assert.throws(() => applyAppearanceCommand(f.store, id, input));
  assert.deepEqual([...f.values], before);
  f.fail();
  assert.throws(() =>
    applyAppearanceCommand(f.store, "appearance.mode", "dark"),
  );
  assert.deepEqual([...f.values], before);
});
test("previews stay ephemeral, cancel to confirmed state and ignore inactive modes or removed themes", () => {
  const preview = new ThemePreviewStore(),
    owner = Symbol(),
    newer = Symbol();
  const f = fixture(),
    before = [...f.values];
  preview.show(owner, "tokyo-night", "dark");
  assert.equal(
    preview.resolve(defaultAppearance, "dark", []).id,
    "tokyo-night",
  );
  assert.equal(
    preview.resolve(defaultAppearance, "light", []).id,
    "console-light",
  );
  assert.deepEqual([...f.values], before);
  preview.clear(owner);
  assert.equal(
    preview.resolve(defaultAppearance, "dark", []).id,
    "console-dark",
  );
  preview.show(owner, "tokyo-night", "dark");
  preview.show(newer, "catppuccin-mocha", "dark");
  preview.clear(owner);
  assert.equal(
    preview.resolve(defaultAppearance, "dark", []).id,
    "catppuccin-mocha",
  );
  preview.clear(newer);
  preview.show(owner, "removed-theme", "dark");
  assert.equal(
    preview.resolve(defaultAppearance, "dark", []).id,
    "console-dark",
  );
});

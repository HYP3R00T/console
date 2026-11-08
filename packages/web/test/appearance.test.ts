import assert from "node:assert/strict";
import test from "node:test";
import {
  ConfigurationStore,
  configurationKey,
  parseBackup,
  parseTheme,
  themeTokens,
} from "../src/lib/configuration/store.ts";
import {
  groupThemeFamilies,
  themeColorGroups,
  themeTokenGroups,
} from "../src/lib/configuration/theme-gallery.ts";
import {
  activeTheme,
  builtinThemes,
  defaultAppearance,
  migrateAppearance,
  parseAppearance,
  themeDocument,
} from "../src/lib/configuration/themes.ts";

function fixture() {
  const data = new Map<string, string>();
  let failing = false;
  const store = new ConfigurationStore({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failing) throw new Error("Quota");
      data.set(key, value);
    },
  });
  return {
    data,
    store,
    fail: () => {
      failing = true;
    },
  };
}
test("system following resolves independent palettes and forced modes ignore system changes", () => {
  const prefs = {
    ...defaultAppearance,
    lightTheme: "catppuccin-latte",
    darkTheme: "tokyo-night",
  };
  assert.equal(activeTheme(prefs, "light", []).id, "catppuccin-latte");
  assert.equal(activeTheme(prefs, "dark", []).id, "tokyo-night");
  assert.equal(
    activeTheme({ ...prefs, lightTheme: "tokyo-night-light" }, "dark", []).id,
    "tokyo-night",
  );
  assert.equal(
    activeTheme({ ...prefs, mode: "light" }, "dark", []).id,
    "catppuccin-latte",
  );
  assert.equal(
    activeTheme({ ...prefs, mode: "dark" }, "light", []).id,
    "tokyo-night",
  );
  for (const invalid of [
    { ...prefs, darkTheme: "catppuccin-latte" },
    { ...prefs, lightTheme: "missing" },
    { ...prefs, mode: "other" },
    { ...prefs, extra: true },
  ])
    assert.throws(() => parseAppearance(invalid, []));
});
test("every built-in theme exports every supported color and imports without losing its preview colors", () => {
  assert.equal(builtinThemes.length, 19);
  for (const theme of builtinThemes) {
    const exported = parseTheme(
      JSON.parse(JSON.stringify(themeDocument(theme))),
    );
    assert.equal(exported.mode, theme.mode);
    assert.deepEqual(
      Object.keys(exported.tokens).sort(),
      [...themeTokens].sort(),
    );
    assert.deepEqual(exported.tokens, theme.tokens);
    const f = fixture();
    f.store.importTheme(exported);
    f.store.saveAppearance({
      ...defaultAppearance,
      [theme.mode === "dark" ? "darkTheme" : "lightTheme"]: exported.id,
    });
    assert.deepEqual(
      activeTheme(f.store.appearance(), theme.mode, f.store.themes()).tokens,
      theme.tokens,
    );
  }
});
test("legacy browser choices and v1 backups migrate while v2 round-trips both palette defaults", () => {
  const custom = {
    id: "custom-old",
    name: "Old",
    mode: "dark",
    tokens: { background: "#112233" },
  };
  const f = fixture();
  f.store.importTheme(custom);
  f.store.setItem("theme", custom.id);
  assert.deepEqual(f.store.appearance(), {
    ...defaultAppearance,
    mode: "dark",
    darkTheme: custom.id,
  });
  const { appearance, ...settings } = f.store.export().settings;
  assert.equal(appearance.darkTheme, custom.id);
  const legacy = {
    version: 1,
    settings: { ...settings, theme: custom.id },
    keybindings: {},
    themes: [custom],
  };
  const migrated = parseBackup(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.settings.appearance.darkTheme, custom.id);
  assert.deepEqual(migrateAppearance("light", []), {
    ...defaultAppearance,
    mode: "light",
  });
  const other = fixture();
  other.store.import(legacy);
  other.store.saveAppearance({
    ...other.store.appearance(),
    mode: "system",
    lightTheme: "catppuccin-latte",
  });
  const backup = other.store.export();
  f.store.import(backup);
  assert.deepEqual(f.store.export(), backup);
  assert.equal(f.store.appearance().lightTheme, "catppuccin-latte");
  assert.equal(f.store.appearance().darkTheme, custom.id);
});
test("invalid, mode-changing or failed saves and imports never mutate confirmed appearance", () => {
  const f = fixture();
  f.store.saveAppearance({ ...defaultAppearance, darkTheme: "dracula" });
  const before = f.data.get(configurationKey);
  assert.throws(() =>
    f.store.saveAppearance({
      ...defaultAppearance,
      darkTheme: "console-light",
    }),
  );
  assert.equal(f.data.get(configurationKey), before);
  assert.throws(() =>
    f.store.importTheme({
      id: "custom-bad",
      name: "Bad",
      mode: "dark",
      tokens: { background: "url(x)" },
    }),
  );
  assert.equal(f.data.get(configurationKey), before);
  f.store.importTheme({
    id: "custom-selected",
    name: "Selected",
    mode: "dark",
    tokens: { primary: "#112233" },
  });
  f.store.saveAppearance({
    ...defaultAppearance,
    darkTheme: "custom-selected",
  });
  const selected = f.data.get(configurationKey);
  assert.throws(() =>
    f.store.importTheme({
      id: "custom-selected",
      name: "Changed",
      mode: "light",
      tokens: { primary: "#112233" },
    }),
  );
  assert.equal(f.data.get(configurationKey), selected);
  f.fail();
  assert.throws(() => f.store.saveAppearance(defaultAppearance), /Quota/);
  assert.equal(f.data.get(configurationKey), selected);
  assert.throws(
    () =>
      f.store.importTheme({
        id: "custom-new",
        name: "New",
        mode: "dark",
        tokens: { primary: "#112233" },
      }),
    /Quota/,
  );
  assert.equal(f.data.get(configurationKey), selected);
});

test("built-in text and primary controls retain readable contrast", () => {
  function luminance(hex: string) {
    const values = hex
      .slice(1)
      .match(/../g)
      ?.map((value) => parseInt(value, 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    assert.ok(values);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  for (const theme of builtinThemes) {
    const t = theme.tokens;
    for (const [text, surface] of [
      [t.foreground, t.background],
      [t["muted-foreground"], t.muted],
      [t["primary-foreground"], t.primary],
      [t["sidebar-foreground"], t.sidebar],
    ]) {
      assert.ok(text && surface);
      const a = luminance(text),
        b = luminance(surface);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${theme.name}: ${text} on ${surface}`,
      );
    }
  }
});

test("theme families expose every variant exactly once and keep imports separate", () => {
  const all = ["light", "dark"].flatMap((mode) =>
    groupThemeFamilies(builtinThemes, mode as "light" | "dark").flatMap(
      (family) => family.variants.map((variant) => variant.theme.id),
    ),
  );
  assert.deepEqual(all.sort(), builtinThemes.map((theme) => theme.id).sort());
  const dark = groupThemeFamilies(builtinThemes, "dark");
  assert.deepEqual(
    dark
      .find((family) => family.id === "catppuccin")
      ?.variants.map((item) => item.label),
    ["Mocha", "Frappé", "Macchiato"],
  );
  assert.deepEqual(
    dark
      .find((family) => family.id === "tokyo-night")
      ?.variants.map((item) => item.label),
    ["Night", "Storm", "Moon"],
  );
  assert.equal(
    groupThemeFamilies(builtinThemes, "light").find(
      (family) => family.id === "tokyo-night",
    )?.variants[0].label,
    "Day",
  );
  const imported = parseTheme(themeDocument(builtinThemes[0]));
  assert.equal(
    groupThemeFamilies([...builtinThemes, imported], "light").at(-1)?.id,
    imported.id,
  );
});

test("palette previews and full inspector cover every exported token without hiding shared roles", () => {
  assert.deepEqual(
    themeTokenGroups.flatMap((group) => [...group.tokens]).sort(),
    [...themeTokens].sort(),
  );
  for (const theme of builtinThemes) {
    const colors = themeColorGroups(theme);
    const roles = colors.flatMap((group) =>
      group.colors.flatMap((color) => color.roles),
    );
    assert.deepEqual(roles.sort(), [...themeTokens].sort());
    for (const group of colors)
      for (const color of group.colors)
        for (const role of color.roles)
          assert.equal(
            theme.tokens[role as keyof typeof theme.tokens]?.toLowerCase(),
            color.hex,
          );
  }
});

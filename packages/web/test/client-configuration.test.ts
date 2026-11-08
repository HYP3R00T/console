import assert from "node:assert/strict";
import test from "node:test";
import {
  ConfigurationStore,
  configurationKey,
  parseBackup,
  parseTheme,
} from "../src/lib/configuration/store.ts";

function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("Quota exceeded");
      values.set(key, value);
    },
  };
  const events: boolean[] = [];
  return {
    values,
    storage,
    store: new ConfigurationStore(storage, (imported) => events.push(imported)),
    events,
    fail: () => {
      fail = true;
    },
  };
}
test("legacy preferences migrate on a successful atomic write and persist across store instances", () => {
  const f = fixture();
  f.values.set("theme", "dark");
  f.values.set(
    "console.shortcuts.v1",
    JSON.stringify({ "conversation.new": "Mod+N" }),
  );
  assert.equal(f.store.getItem("theme"), "dark");
  assert.equal(f.values.has(configurationKey), false);
  f.store.setItem("theme", "light");
  const reopened = new ConfigurationStore(f.storage);
  assert.equal(reopened.export().settings.appearance.mode, "light");
  assert.equal(reopened.export().keybindings["conversation.new"], "Mod+N");
  assert.equal(
    f.values.get("theme"),
    "dark",
    "legacy data is retained rather than destructively rewritten",
  );
});
test("backups round-trip and replace all categories without credentials, identity trust or active connections", () => {
  const f = fixture();
  f.store.setItem(
    "console.devices.v1",
    JSON.stringify([
      {
        id: "machine",
        name: "Local",
        url: "http://localhost:3000",
        backendId: "12345678-1234-1234-1234-123456789abc",
      },
    ]),
  );
  f.store.setItem("console.connected-devices.v2", '["machine"]');
  f.store.setItem(
    "console.themes.v1",
    JSON.stringify([
      {
        id: "custom-blue",
        name: "Blue",
        mode: "dark",
        tokens: { background: "#112233" },
      },
    ]),
  );
  f.store.setItem("theme", "custom-blue");
  const backup = f.store.export();
  assert.equal("backendId" in backup.settings.bookmarks[0], false);
  assert.equal(JSON.stringify(backup).includes("connected-devices"), false);
  const other = fixture();
  other.store.setItem("theme", "light");
  other.store.setItem("console.shortcuts.v1", '{"conversation.new":"Mod+N"}');
  other.store.import(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(other.store.export(), backup);
  assert.deepEqual(other.store.export().keybindings, {});
  assert.equal(other.store.getItem("console.connected-devices.v2"), "[]");
  assert.equal(other.events.at(-1), true);
  other.store.undo();
  assert.equal(other.store.export().settings.appearance.mode, "light");
  assert.equal(other.store.export().keybindings["conversation.new"], "Mod+N");
  assert.equal(other.store.getItem("console.connected-devices.v2"), "[]");
});
test("invalid imports and storage failures leave the complete saved configuration unchanged", () => {
  const f = fixture();
  f.store.setItem("theme", "dark");
  const before = f.values.get(configurationKey),
    backup = f.store.export();
  for (const invalid of [
    { ...backup, version: 999 },
    { ...backup, keybindings: { "conversation.new": "Mod+K" } },
    { ...backup, keybindings: { unknown: "Mod+N" } },
    { ...backup, keybindings: { "conversation.new": "Mod+V" } },
    {
      ...backup,
      themes: [
        {
          id: "custom-bad",
          name: "Bad",
          mode: "dark",
          tokens: { background: "url(https://example.com)" },
        },
      ],
    },
    { ...backup, settings: { ...backup.settings, theme: "missing" } },
  ]) {
    assert.throws(() => f.store.import(invalid));
    assert.equal(f.values.get(configurationKey), before);
  }
  f.fail();
  assert.throws(() => f.store.import(backup), /Quota/);
  assert.equal(f.values.get(configurationKey), before);
  assert.throws(() => f.store.undo(), /No configuration/);
});
test("theme validation accepts only supported tokens and plain hex colors", () => {
  const theme = {
    id: "custom-test",
    name: "Test",
    mode: "light",
    tokens: { primary: "#123AbC" },
  };
  assert.deepEqual(parseTheme(theme), theme);
  for (const tokens of [
    { unknown: "#123456" },
    { primary: "red; color: black" },
    { primary: "#fff" },
    {},
  ])
    assert.throws(() => parseTheme({ ...theme, tokens }));
  const data = fixture().store.export();
  assert.deepEqual(
    parseBackup({
      ...data,
      settings: {
        ...data.settings,
        navigation: { disclosures: {}, routes: {} },
      },
    }),
    data,
  );
});

test("navigation backups preserve per-conversation inspector choices and reject invalid choices atomically", () => {
  const f = fixture();
  const navigation = {
    routes: {},
    disclosures: {},
    inspectors: {
      '["backend","session","1"]': { scope: "project", section: "context" },
    },
  };
  f.store.setItem("console.navigation.v1", JSON.stringify(navigation));
  const backup = f.store.export();
  const other = fixture();
  other.store.import(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(other.store.export().settings.navigation, navigation);
  const before = other.values.get(configurationKey);
  assert.throws(() =>
    other.store.import({
      ...backup,
      settings: {
        ...backup.settings,
        navigation: {
          ...navigation,
          inspectors: { bad: { scope: "invalid", section: "tools" } },
        },
      },
    }),
  );
  assert.equal(other.values.get(configurationKey), before);
});

import assert from "node:assert/strict";
import test from "node:test";
import { commands, shortcutFor } from "../src/lib/commands.ts";
import { searchDestinations } from "../src/lib/palette-navigation.ts";
import {
  commandAliases,
  paletteSearchScore,
  rankPaletteResults,
} from "../src/lib/palette-search.ts";

test("familiar panel and theme vocabulary finds one stable command without target-name noise", () => {
  const score = (id: keyof typeof commands, query: string) =>
    paletteSearchScore(query, [commands[id].label, ...commandAliases(id), id]);
  assert.ok(score("workspace.navigation", "left panel") > 0);
  assert.ok(score("workspace.details", "right panel") > 0);
  assert.equal(score("appearance.light-theme", "left panel"), 0);
  assert.ok(score("appearance.theme", "themes") > 0);
  assert.ok(score("workspace.navigation", "toglle") > 0);
  assert.equal(score("conversation.stop", "Main"), 0);
  assert.equal(shortcutFor("appearance.theme", {}), null);
  assert.equal(shortcutFor("navigation.conversations", {}), null);
});
test("global navigation finds other projects and machines; explicit filters narrow it", () => {
  const items = [
    {
      id: "a",
      kind: "conversation" as const,
      label: "Conversation 3",
      path: ["Remote", "Other project", "Conversation 3"],
      target: {
        deviceId: "remote",
        projectId: "other",
        sessionId: "s",
        conversationId: "3",
      },
    },
    {
      id: "b",
      kind: "conversation" as const,
      label: "Main",
      path: ["Local", "Main"],
      target: { deviceId: "local", sessionId: "s", conversationId: "1" },
    },
  ];
  assert.equal(searchDestinations(items, {}, "conversation 3")[0]?.id, "a");
  assert.equal(
    searchDestinations(items, { deviceId: "local" }, "conversation 3").length,
    0,
  );
  assert.equal(searchDestinations(items, {}, "Main")[0]?.id, "b");
});
test("textual relevance dominates context boosts and ties retain stable ordering", () => {
  const items = [
    { name: "Theme settings", local: true },
    { name: "Theme", local: false },
    { name: "Theme", local: false },
  ];
  const ranked = rankPaletteResults(
    items,
    (item) => paletteSearchScore("theme", [item.name]),
    (item) => (item.local ? 5 : 0),
  );
  assert.deepEqual(ranked, [items[1], items[2], items[0]]);
  assert.equal(paletteSearchScore("zzzz", ["Theme"]), 0);
});

test("conversation numbers never match incidental UUID digits or typo-substitute another number", () => {
  assert.equal(
    paletteSearchScore(
      "conversation 3",
      ["Conversation 1"],
      ["Project a3b-123", "Session c3def"],
    ),
    0,
  );
  assert.equal(
    paletteSearchScore(
      "conversation3",
      ["Conversation 1"],
      ["Project a3b-123"],
    ),
    0,
  );
  assert.ok(paletteSearchScore("conversation3", ["Conversation 3"]) > 0);
});

test("dynamic results select the first usable match while refreshes do not redirect an existing selection", async () => {
  const { paletteSelection } = await import("../src/lib/palette-search.ts");
  assert.equal(
    paletteSelection("", [
      { value: "disabled", disabled: true },
      { value: "conversation:3" },
    ]),
    "conversation:3",
  );
  assert.equal(
    paletteSelection("old", [{ value: "conversation:3" }]),
    "conversation:3",
  );
  assert.equal(
    paletteSelection("stop", [
      { value: "new" },
      { value: "stop", disabled: true },
    ]),
    "stop",
  );
  assert.equal(paletteSelection("stop", []), "");
});

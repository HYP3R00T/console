import assert from "node:assert/strict";
import test from "node:test";
import { splitPinnedItems } from "../src/lib/navigation-sections.ts";

test("sidebar partitions pins without duplicates and restores source order on unpin", () => {
  const items = [{ id: "old" }, { id: "middle" }, { id: "new" }];
  const grouped = splitPinnedItems(items, (item) => item.id, [
    "missing",
    "new",
    "old",
  ]);
  assert.deepEqual(grouped.pinned, [items[2], items[0]]);
  assert.deepEqual(grouped.regular, [items[1]]);
  assert.equal(
    new Set([...grouped.pinned, ...grouped.regular]).size,
    items.length,
  );
  const unpinned = splitPinnedItems(items, (item) => item.id, []);
  assert.deepEqual(unpinned, { pinned: [], regular: items });
  assert.deepEqual(
    items.map((item) => item.id),
    ["old", "middle", "new"],
  );
  assert.deepEqual(
    splitPinnedItems([], (item) => String(item), ["missing"]),
    { pinned: [], regular: [] },
  );
  const standalone = [
    { session: "one", id: 1 },
    { session: "two", id: 1 },
  ];
  assert.deepEqual(
    splitPinnedItems(standalone, (item) => `${item.session}:${item.id}`, [
      "project:1",
      "two:1",
    ]),
    {
      pinned: [standalone[1]],
      regular: [standalone[0]],
    },
  );
});

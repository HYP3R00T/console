import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationKey,
  orderConversations,
  parseConversationPins,
} from "../src/lib/conversation-pins.ts";
import { updateProjectPins } from "../src/lib/project-pins.ts";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const origin = "http://localhost:3000";
const other = "http://localhost:4000";

test("conversation pins distinguish identical Durable IDs across sessions and backends", () => {
  const one = conversationKey(a, 1);
  const two = conversationKey(b, 1);
  let pins = updateProjectPins({}, origin, one, true);
  pins = updateProjectPins(pins, origin, two, true);
  pins = updateProjectPins(pins, other, one, true);
  assert.deepEqual(parseConversationPins(JSON.stringify(pins)), {
    [origin]: [two, one],
    [other]: [one],
  });
  const changed = updateProjectPins(pins, origin, one, false);
  assert.deepEqual(changed[origin], [two]);
  assert.deepEqual(changed[other], [one]);
  assert.deepEqual(pins[origin], [two, one]);
});
test("pinned conversations sort first within a session while preserving unpinned and unknown-item order", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const pins = [
    conversationKey(b, 1),
    conversationKey(a, 3),
    conversationKey(a, 99),
  ];
  assert.deepEqual(
    orderConversations(items, (item) => conversationKey(a, item.id), pins),
    [{ id: 3 }, { id: 1 }, { id: 2 }],
  );
  assert.deepEqual(items, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(parseConversationPins(null), {});
  for (const value of [
    "[]",
    '{"http://localhost:3000":["1"]}',
    JSON.stringify({
      [origin]: [conversationKey(a, 1), conversationKey(a, 1)],
    }),
    JSON.stringify({ [origin]: [`${a}:NaN`] }),
  ])
    assert.throws(() => parseConversationPins(value));
});

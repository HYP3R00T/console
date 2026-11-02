import assert from "node:assert/strict";
import test from "node:test";
import {
  orderPinnedProjects,
  parseProjectPins,
  updateProjectPins,
} from "../src/lib/project-pins.ts";

test("project pins round-trip by backend without changing other machines", () => {
  const first = "http://127.0.0.1:3000";
  const second = "http://localhost:4000";
  let pins = updateProjectPins({}, first, "older", true);
  pins = updateProjectPins(pins, second, "other-machine", true);
  pins = updateProjectPins(pins, first, "newer", true);
  assert.deepEqual(parseProjectPins(JSON.stringify(pins)), {
    [first]: ["newer", "older"],
    [second]: ["other-machine"],
  });
  assert.deepEqual(updateProjectPins(pins, first, "newer", false)[first], [
    "older",
  ]);
  assert.deepEqual(pins[first], ["newer", "older"]);
  assert.deepEqual(updateProjectPins(pins, first, "older", true)[first], [
    "older",
    "newer",
  ]);
});
test("pin ordering puts newest pins first and preserves unpinned order", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(
    orderPinnedProjects(projects, ["missing", "c", "a"]).map((p) => p.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(
    projects.map((p) => p.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(orderPinnedProjects(projects, []), projects);
});
test("corrupt pin storage and invalid backend keys are rejected", () => {
  assert.deepEqual(parseProjectPins(null), {});
  for (const value of [
    "null",
    "[]",
    "{",
    '{"http://127.0.0.1:3000":["same","same"]}',
    '{"http://127.0.0.1:3000":[null]}',
    '{"http://127.0.0.1:3000":[""]}',
    '{"http://127.0.0.1:3000":{}}',
    '{"https://example.com":["id"]}',
    '{"__proto__":["id"]}',
  ])
    assert.throws(() => parseProjectPins(value));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyNavigationMemory,
  parseNavigationMemory,
  workspaceDevice,
} from "../src/lib/navigation-memory.ts";

test("navigation memory keeps independent machine routes and disclosure choices", () => {
  const memory = {
    routes: {
      a: "/devices/a/projects/p/sessions/s/conversations/1",
      b: "/devices/b/conversations/standalone",
    },
    disclosures: {
      "a:project:p": true,
      "a:section:pinned": false,
      "b:section:recents": true,
    },
  };
  assert.deepEqual(parseNavigationMemory(JSON.stringify(memory)), memory);
  assert.equal(workspaceDevice(memory.routes.a), "a");
  assert.equal(
    workspaceDevice("/devices/machine%20one/conversations/s"),
    "machine one",
  );
});
test("restored destinations cannot leave their owning machine or navigate to arbitrary URLs", () => {
  for (const route of [
    "https://example.com",
    "//example.com",
    "/devices/b/conversations/s",
    "/devices/a",
    "/devices/a/settings/providers",
    "/devices/a/conversations/s?next=x",
    "/devices/a/conversations/s#fragment",
  ]) {
    assert.deepEqual(
      parseNavigationMemory(JSON.stringify({ routes: { a: route } })).routes,
      {},
    );
  }
  assert.equal(workspaceDevice("/devices/%/conversations/s"), undefined);
});
test("corrupt preferences are ignored while valid entries survive", () => {
  for (const value of [null, "bad JSON", "null", "[]", "123"])
    assert.deepEqual(parseNavigationMemory(value), emptyNavigationMemory());
  assert.deepEqual(
    parseNavigationMemory(
      JSON.stringify({
        routes: { a: 123, b: "/devices/b/conversations/s" },
        disclosures: { good: false, bad: "true" },
      }),
    ),
    {
      routes: { b: "/devices/b/conversations/s" },
      disclosures: { good: false },
    },
  );
});

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

test("standalone branch bookmarks retain the machine scope", () => {
  assert.equal(workspaceDevice("/devices/a/conversations/s/42"), "a");
  for (const path of [
    "/devices/a/conversations/s/0",
    "/devices/a/conversations/s/42/extra",
    "/devices/a/conversations/s/42?next=x",
  ]) {
    assert.equal(workspaceDevice(path), undefined);
  }
});

test("recent routes retain visit order, deduplicate, stay bounded and migrate legacy memory", async () => {
  const { rememberWorkspaceRoute } = await import(
    "../src/lib/navigation-memory.ts"
  );
  let memory = emptyNavigationMemory();
  for (let i = 0; i < 35; i++)
    memory = rememberWorkspaceRoute(memory, `/devices/a/conversations/s${i}`);
  assert.equal(memory.recentRoutes?.length, 30);
  memory = rememberWorkspaceRoute(memory, "/devices/a/conversations/s10");
  assert.equal(memory.recentRoutes?.[0], "/devices/a/conversations/s10");
  assert.equal(
    memory.recentRoutes?.filter((route) => route.endsWith("/s10")).length,
    1,
  );
  assert.equal(rememberWorkspaceRoute(memory, "/settings/appearance"), memory);
  assert.deepEqual(parseNavigationMemory(JSON.stringify(memory)), memory);
  const legacy = {
    routes: { b: "/devices/b/conversations/old" },
    disclosures: {},
  };
  assert.deepEqual(
    rememberWorkspaceRoute(legacy, "/devices/a/conversations/new").recentRoutes,
    ["/devices/a/conversations/new", "/devices/b/conversations/old"],
  );
  assert.deepEqual(
    parseNavigationMemory(
      '{"recentRoutes":["https://example.com","/devices/a/conversations/s","/devices/a/conversations/s"]}',
    ).recentRoutes,
    ["/devices/a/conversations/s"],
  );
});

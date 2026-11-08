import assert from "node:assert/strict";
import test from "node:test";
import { loadPaletteCatalog } from "../src/lib/palette-catalog.ts";
import {
  conversationHref,
  paletteAncestors,
  paletteCommandGroup,
  paletteCommandTarget,
  paletteTargetFromPath,
  rememberedDestinations,
  searchDestinations,
  targetKey,
} from "../src/lib/palette-navigation.ts";

const device = {
  id: "machine",
  name: "Workstation",
  url: "http://localhost:3000",
};
function fixture(fail = "") {
  const requests: string[] = [];
  const session = {
    sessionId: "s",
    projectId: "p",
    number: 1,
    name: "Session",
  };
  const data: Record<string, unknown> = {
    "/v1/projects": {
      projects: [
        { id: "p", name: "Console", available: true },
        { id: "unavailable", name: "Offline folder", available: false },
      ],
    },
    "/v1/standalone": {
      sessions: [
        {
          ...session,
          sessionId: "solo",
          projectId: "standalone",
          name: "A standalone chat",
          conversationId: 1,
        },
      ],
    },
    "/v1/projects/p/sessions": { sessions: [session] },
    "/v1/sessions/s/conversations": {
      session,
      conversations: [
        { id: 1, name: "Main" },
        { id: 2, name: "Fork" },
      ],
      more: true,
    },
  };
  return {
    requests,
    client: {
      request: async <T>(path: string, init?: RequestInit) => {
        requests.push(path);
        assert.equal(
          init?.method,
          undefined,
          "Catalog requests must be read-only",
        );
        assert.ok(init?.signal);
        if (path === fail) throw new Error("Unavailable endpoint");
        assert.ok(path in data, `Unexpected endpoint: ${path}`);
        return data[path] as T;
      },
    },
  };
}
test("catalog navigates project sessions and standalone conversations using existing read endpoints", async () => {
  const f = fixture();
  const result = await loadPaletteCatalog(
    device,
    f.client,
    new AbortController().signal,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.more, true);
  const main = result.destinations.find((item) => item.label === "Main");
  assert.equal(
    main?.href,
    "/devices/machine/projects/p/sessions/s/conversations/1",
  );
  const standalone = result.destinations.find(
    (item) => item.label === "A standalone chat",
  );
  assert.equal(standalone?.target.projectId, undefined);
  assert.equal(standalone?.href, "/devices/machine/conversations/solo");
  assert.ok(!f.requests.some((path) => path.includes("unavailable/")));
  assert.ok(!f.requests.some((path) => path.includes("messages")));
  assert.equal(
    searchDestinations(
      result.destinations,
      { deviceId: "machine", projectId: "p" },
      "fork",
    ).length,
    1,
  );
  assert.equal(
    searchDestinations(
      result.destinations,
      { deviceId: "machine", sessionId: "solo" },
      "Fork",
    ).length,
    0,
  );
});
test("partial endpoint failures preserve available navigation and report incomplete catalogs", async () => {
  const f = fixture("/v1/projects/p/sessions");
  const result = await loadPaletteCatalog(
    device,
    f.client,
    new AbortController().signal,
  );
  assert.deepEqual(result.errors, ["Unavailable endpoint"]);
  assert.ok(
    result.destinations.some((item) => item.label === "A standalone chat"),
  );
  assert.ok(result.destinations.some((item) => item.label === "Console"));
  const cancelled = new AbortController();
  cancelled.abort();
  const abortFixture = fixture();
  await loadPaletteCatalog(device, abortFixture.client, cancelled.signal);
  assert.equal(abortFixture.requests.length, 0);
});
test("breadcrumbs skip absent projects, widen filters and preserve canonical conversation addresses", () => {
  const solo = { deviceId: "m", sessionId: "s", conversationId: "2" };
  assert.deepEqual(
    paletteAncestors(solo).map((item) => item.kind),
    ["machine", "session", "conversation"],
  );
  assert.equal(conversationHref(solo), "/devices/m/conversations/s/2");
  assert.deepEqual(paletteTargetFromPath(conversationHref(solo) ?? ""), solo);
  assert.deepEqual(
    paletteAncestors({ ...solo, projectId: "p" }).map((item) => item.kind),
    ["machine", "project", "session", "conversation"],
  );
  for (const path of [
    "https://example.com",
    "//example.com",
    "/devices/m/settings/providers",
    "/devices/%/conversations/s",
    "/devices/m/conversations/s?x=1",
  ])
    assert.equal(paletteTargetFromPath(path), undefined);
});
test("remembered destinations use known names or safe offline fallbacks and omit deleted machines", () => {
  const machine = {
    id: "machine:m",
    kind: "machine" as const,
    label: "Local",
    target: { deviceId: "m" },
    path: ["Local"],
  };
  const recent = rememberedDestinations(
    [machine],
    [
      "/devices/m/conversations/s",
      "/devices/m/conversations/s/1",
      "/devices/removed/conversations/s",
      "https://example.com",
    ],
  );
  assert.equal(recent.length, 1);
  assert.equal(recent[0].href, "/devices/m/conversations/s");
  assert.equal(recent[0].path[0], "Local");
  assert.equal(
    rememberedDestinations([machine], ["/devices/m/conversations/new"])[0]
      .label,
    "New conversation",
  );
});
test("commands retain their current-view target independently of destination browsing", () => {
  const target = {
    deviceId: "a",
    projectId: "p",
    sessionId: "s",
    conversationId: "1",
  };
  assert.deepEqual(paletteCommandTarget("conversation.stop", target), target);
  assert.deepEqual(
    paletteCommandTarget("project.agent-settings.update", target),
    { deviceId: "a", projectId: "p" },
  );
  assert.equal(
    paletteCommandTarget("preferences.appearance", target),
    "client",
  );
  assert.equal(paletteCommandGroup("machine.providers"), "Settings");
  assert.equal(paletteCommandGroup("conversation.stop"), "Actions");
  assert.equal(
    targetKey({ deviceId: "m" }),
    targetKey({ deviceId: "m", projectId: undefined }),
  );
});

test("deferred selections cannot cross routes, URLs or clients", async () => {
  const { paletteSelectionIsCurrent } = await import(
    "../src/lib/palette-navigation.ts"
  );
  const selected = {
    route: "/a",
    url: "http://localhost/a?machine=one",
    client: {},
  };
  assert.equal(paletteSelectionIsCurrent(selected, { ...selected }), true);
  assert.equal(
    paletteSelectionIsCurrent(selected, { ...selected, route: "/b" }),
    false,
  );
  assert.equal(
    paletteSelectionIsCurrent(selected, {
      ...selected,
      url: "http://localhost/a?machine=two",
    }),
    false,
  );
  assert.equal(
    paletteSelectionIsCurrent(selected, { ...selected, client: {} }),
    false,
  );
});

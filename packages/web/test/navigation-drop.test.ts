import assert from "node:assert/strict";
import test from "node:test";
import { navigationDropIntent } from "../src/lib/navigation-drop.ts";

test("drag placement pins without changing chat ownership", () => {
  const project = { kind: "project", id: "p" } as const;
  const standalone = { kind: "conversation", sessionId: "s", id: 1 } as const;
  const chat = { ...standalone, projectId: "p" };
  for (const item of [project, standalone, chat])
    assert.deepEqual(navigationDropIntent(item, "pinned"), { pinned: true });
  assert.deepEqual(navigationDropIntent(project, "projects"), {
    pinned: false,
  });
  assert.deepEqual(navigationDropIntent(standalone, "recents"), {
    pinned: false,
  });
  assert.deepEqual(navigationDropIntent(chat, { projectId: "p" }), {
    pinned: false,
  });
  for (const [item, target] of [
    [chat, "recents"],
    [standalone, { projectId: "p" }],
    [chat, { projectId: "other" }],
    [project, "recents"],
  ] as const) {
    assert.ok("reason" in navigationDropIntent(item, target));
  }
  assert.equal(chat.projectId, "p");
});

test("entity contracts expose only implemented actions", async () => {
  const { supportsNavigationAction } = await import(
    "../src/lib/navigation-actions.ts"
  );
  assert.ok(supportsNavigationAction("project", "remove"));
  assert.ok(supportsNavigationAction("section", "toggle-section"));
  assert.ok(supportsNavigationAction("conversation", "rename"));
  assert.equal(supportsNavigationAction("conversation", "remove"), false);
  assert.equal(
    supportsNavigationAction("conversation", "create-session"),
    false,
  );
});

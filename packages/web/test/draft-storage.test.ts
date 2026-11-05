import assert from "node:assert/strict";
import test from "node:test";
import {
  draftStorageKey,
  moveDraft,
} from "../src/components/sessions/draft-storage.ts";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
test("moving a draft preserves text and attachments across backend scopes", () => {
  const store = storage();
  const source = draftStorageKey("http://localhost:3000", "project");
  const target = draftStorageKey("http://localhost:3002");
  const draft = {
    content: "keep my prompt",
    attachments: [{ name: "file.txt", data: "aGVsbG8=" }],
  };
  store.setItem(source, JSON.stringify(draft));
  moveDraft(store, source, target, draft);
  assert.equal(store.getItem(source), null);
  assert.deepEqual(JSON.parse(store.getItem(target) ?? ""), draft);
});
test("draft moves preserve both drafts on conflicts and storage failure, and reject pending delivery", () => {
  const store = storage();
  store.setItem("source", '{"content":"source"}');
  store.setItem("target", '{"content":"target"}');
  assert.throws(
    () => moveDraft(store, "source", "target", { content: "source" }),
    /already has/,
  );
  assert.equal(store.getItem("target"), '{"content":"target"}');
  assert.throws(
    () =>
      moveDraft(store, "source", "other", { content: "source", pending: {} }),
    /finish sending/,
  );
  assert.throws(
    () =>
      moveDraft(
        {
          ...store,
          setItem: () => {
            throw new Error("quota");
          },
        },
        "source",
        "other",
        { content: "source" },
      ),
    /quota/,
  );
  assert.equal(store.getItem("source"), '{"content":"source"}');
});

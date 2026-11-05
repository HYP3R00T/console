import assert from "node:assert/strict";
import test from "node:test";
import {
  captureScrollAnchor,
  restoreScrollAnchor,
} from "../src/components/sessions/scroll-anchor.ts";

test("prepending history keeps the visible message offset, while appending below does not move it", () => {
  let messageTop = 50;
  const area = {
    scrollTop: 400,
    scrollHeight: 2000,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => [
      {
        dataset: { messageId: "old" },
        getBoundingClientRect: () => ({ top: -500, bottom: -100 }),
      },
      {
        dataset: { messageId: "visible" },
        getBoundingClientRect: () => ({
          top: messageTop,
          bottom: messageTop + 300,
        }),
      },
    ],
  };
  const viewport = area as unknown as HTMLElement;
  const anchor = captureScrollAnchor(viewport);
  assert.equal(anchor.id, "visible");
  area.scrollHeight = 3000;
  messageTop += 1000;
  restoreScrollAnchor(viewport, anchor);
  assert.equal(area.scrollTop, 1400);
  messageTop = 50;
  const next = captureScrollAnchor(viewport);
  area.scrollHeight = 3500;
  restoreScrollAnchor(viewport, next);
  assert.equal(area.scrollTop, 1400);
});

test("history loading retains a fallback position when regrouping replaces an activity anchor", () => {
  let nodes = [
    {
      dataset: { messageId: "activity:1" },
      getBoundingClientRect: () => ({ top: 20, bottom: 400 }),
    },
  ];
  const area = {
    scrollTop: 100,
    scrollHeight: 1000,
    getBoundingClientRect: () => ({ top: 20 }),
    querySelectorAll: () => nodes,
  };
  const viewport = area as unknown as HTMLElement;
  const anchor = captureScrollAnchor(viewport);
  nodes = [];
  area.scrollHeight += 500;
  restoreScrollAnchor(viewport, anchor);
  assert.equal(area.scrollTop, 600);
});

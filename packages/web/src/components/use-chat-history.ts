"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type HistoryPage, mergeMessages } from "@/lib/chat-history";
import { api, type Conversation } from "@/lib/console-api";

export function useChatHistory(session: Conversation, path: string) {
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [following, setFollowing] = useState(true);
  const previousTop = useRef(0);
  const request = useRef<AbortController | null>(null);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const [cached, setCached] = useState(session.messages);
  const [cursor, setCursor] = useState(session.olderCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messages = useMemo(
    () => mergeMessages(cached, session.messages),
    [cached, session.messages],
  );
  useEffect(() => {
    setCached((current) => mergeMessages(current, session.messages));
  }, [session.messages]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useLayoutEffect(() => {
    const area = viewport.current;
    if (!area) return;
    if (anchor.current) {
      const entry = Array.from(
        area.querySelectorAll<HTMLElement>("[data-message-id]"),
      )
        .reverse()
        .find(
          (entry) =>
            entry.dataset.messageId === anchor.current?.id ||
            entry.dataset.messageIds
              ?.split(",")
              .includes(anchor.current?.id ?? ""),
        );
      if (entry)
        area.scrollTop +=
          entry.getBoundingClientRect().top -
          area.getBoundingClientRect().top -
          anchor.current.offset;
      anchor.current = null;
    } else if (pinned.current) area.scrollTop = area.scrollHeight;
    previousTop.current = area.scrollTop;
  });
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const area = viewport.current;
      if (area && pinned.current) {
        area.scrollTop = area.scrollHeight;
        previousTop.current = area.scrollTop;
      }
    });
    if (content.current) observer.observe(content.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  async function loadOlder() {
    if (!cursor || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const page = await api<HistoryPage>(
        `${path}/history?before=${encodeURIComponent(cursor)}`,
        "GET",
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const area = viewport.current;
      if (area && !pinned.current) {
        const top = area.getBoundingClientRect().top;
        const candidates = Array.from(
          area.querySelectorAll<HTMLElement>("[data-message-id]"),
        ).filter((entry) => {
          const bounds = entry.getBoundingClientRect();
          return (
            bounds.height > 0 &&
            bounds.bottom > top &&
            bounds.top < area.getBoundingClientRect().bottom
          );
        });
        const visible = candidates.find(
          (entry) =>
            !candidates.some(
              (other) => entry !== other && entry.contains(other),
            ),
        );
        if (visible?.dataset.messageId)
          anchor.current = {
            id: visible.dataset.messageId,
            offset: visible.getBoundingClientRect().top - top,
          };
      }
      setCached((current) => mergeMessages(current, page.messages));
      setCursor(page.olderCursor);
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message);
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(false);
      }
    }
  }
  function onScroll() {
    const area = viewport.current;
    if (!area) return;
    const upward = area.scrollTop < previousTop.current;
    pinned.current =
      area.scrollHeight - area.clientHeight - area.scrollTop <= 4;
    setFollowing(pinned.current);
    previousTop.current = area.scrollTop;
    if (upward && area.scrollTop < 80) void loadOlder();
  }
  return {
    viewport,
    content,
    messages,
    hasOlder: !!cursor,
    loading,
    error,
    onScroll,
    loadOlder,
    following,
    pauseFollowing: () => {
      pinned.current = false;
      setFollowing(false);
    },
    jumpToLatest: () => {
      pinned.current = true;
      setFollowing(true);
      const area = viewport.current;
      if (area) {
        area.scrollTop = area.scrollHeight;
        previousTop.current = area.scrollTop;
      }
    },
    onWheel: (delta: number) => {
      if (delta < 0) {
        pinned.current = false;
        setFollowing(false);
        if ((viewport.current?.scrollTop ?? 0) < 80) void loadOlder();
      }
    },
  };
}

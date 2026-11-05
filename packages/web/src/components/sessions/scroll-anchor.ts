export type ScrollAnchor = {
  id?: string;
  top?: number;
  height: number;
  scrollTop: number;
};

export function captureScrollAnchor(area: HTMLElement): ScrollAnchor {
  const top = area.getBoundingClientRect().top;
  const element = [
    ...area.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((element) => element.getBoundingClientRect().bottom > top);
  return {
    id: element?.dataset.messageId,
    top: element?.getBoundingClientRect().top,
    height: area.scrollHeight,
    scrollTop: area.scrollTop,
  };
}

export function restoreScrollAnchor(area: HTMLElement, anchor: ScrollAnchor) {
  const element = anchor.id
    ? [...area.querySelectorAll<HTMLElement>("[data-message-id]")].find(
        (element) => element.dataset.messageId === anchor.id,
      )
    : undefined;
  area.scrollTop =
    element && anchor.top !== undefined
      ? area.scrollTop + element.getBoundingClientRect().top - anchor.top
      : anchor.scrollTop + area.scrollHeight - anchor.height;
}

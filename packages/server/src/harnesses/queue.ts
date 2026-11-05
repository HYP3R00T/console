import type { InboxItem } from "@earendil-works/pi-durable";

/** Project only user-facing queue data; never publish original attachment bytes. */
export function queueView(items: readonly InboxItem[]) {
  return items.flatMap((item) => {
    if (item.mode === "write") return [];
    const data =
      item.entry?.kind === "console.input" ? item.entry.data : undefined;
    const attached =
      data && typeof data === "object" && !Array.isArray(data)
        ? data
        : undefined;
    const content =
      typeof item.content === "string"
        ? item.content
        : item.content[0]?.type === "text"
          ? item.content[0].text
          : "";
    return [
      {
        id: item.id,
        whenBusy: item.mode,
        content,
        attachments: Array.isArray(attached?.attachments)
          ? attached.attachments.flatMap((file) =>
              file &&
              typeof file === "object" &&
              !Array.isArray(file) &&
              typeof file.name === "string"
                ? [{ name: file.name }]
                : [],
            )
          : [],
      },
    ];
  });
}

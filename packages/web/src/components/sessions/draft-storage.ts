export function draftStorageKey(
  origin: string | undefined,
  projectId?: string,
  sessionId?: string,
) {
  return `console.draft:${origin}:${projectId ?? "recent"}:${sessionId ?? "default"}`;
}

export function moveDraft(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  source: string,
  destination: string,
  draft: { content: string; attachments?: unknown[]; pending?: unknown },
) {
  if (source === destination) return;
  if (draft.pending)
    throw new Error("Retry or finish sending before changing destination.");
  const saved = storage.getItem(destination);
  if (saved) {
    const existing = JSON.parse(saved);
    if (
      existing.content?.trim() ||
      existing.attachments?.length ||
      existing.pending
    )
      throw new Error(
        "That destination already has an unsent draft. Open it separately before moving this one.",
      );
  }
  storage.setItem(destination, JSON.stringify(draft));
  storage.removeItem(source);
}

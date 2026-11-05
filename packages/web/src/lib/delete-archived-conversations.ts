export type ArchiveTarget = {
  sessionId: string;
  conversationId: number;
  name: string;
};

// Retry blocked parents after their archived descendants have been removed.
// A pass with no progress ends the batch and preserves the failures for review.
export async function deleteArchivedConversations<T extends ArchiveTarget>(
  targets: readonly T[],
  remove: (target: T) => Promise<unknown>,
) {
  let remaining = [...targets];
  let deleted = 0;
  let failures: { target: T; message: string }[] = [];
  while (remaining.length) {
    failures = [];
    for (const target of remaining) {
      try {
        await remove(target);
        deleted++;
      } catch (cause) {
        failures.push({
          target,
          message: cause instanceof Error ? cause.message : "Deletion failed.",
        });
      }
    }
    if (failures.length === remaining.length) break;
    remaining = failures.map(({ target }) => target);
  }
  return { deleted, failures };
}

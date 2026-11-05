import type { ChatMessage, TranscriptChunk } from "./conversation-state.ts";

export type HistoryGap = { before: number; earlier: boolean };
export type TranscriptSection = { gap?: HistoryGap; messages: ChatMessage[] };

/** Raw ancestry, not numeric adjacency: sibling conversations share the ID allocator. */
export class ChatTranscript {
  private previous = new Map<number, number | undefined>();
  private messages = new Map<string, ChatMessage>();
  private current: TranscriptSection[] = [{ messages: [] }];

  merge(chunk: TranscriptChunk) {
    const ids = chunk.history?.ids;
    if (
      !Array.isArray(ids) ||
      ids.some(
        (id, index) =>
          !Number.isSafeInteger(id) ||
          id < 1 ||
          (index > 0 && id <= ids[index - 1]),
      )
    )
      throw new Error("Invalid transcript boundaries.");
    if (
      chunk.history.before !== undefined &&
      (!Number.isSafeInteger(chunk.history.before) ||
        chunk.history.before < 1 ||
        !ids.length ||
        chunk.history.before >= ids[0])
    )
      throw new Error("Invalid transcript predecessor.");
    const included = new Set(ids);
    if (chunk.messages.some((message) => !included.has(message.entryId)))
      throw new Error("Message outside transcript boundaries.");
    let changed = false;
    ids.forEach((id, index) => {
      const previous = index ? ids[index - 1] : chunk.history.before;
      if (!this.previous.has(id) || this.previous.get(id) !== previous) {
        this.previous.set(id, previous);
        changed = true;
      }
    });
    for (const message of chunk.messages) {
      if (!this.messages.has(message.id)) {
        this.messages.set(message.id, message);
        changed = true;
      }
    }
    if (changed) this.current = this.buildSections();
    return this.current;
  }

  sections(): TranscriptSection[] {
    return this.current;
  }

  private buildSections(): TranscriptSection[] {
    const messages = [...this.messages.values()].sort(
      (a, b) => a.entryId - b.entryId,
    );
    const gaps = [...this.previous]
      .sort(([a], [b]) => a - b)
      .flatMap(([id, previous], index) =>
        previous !== undefined && !this.previous.has(previous)
          ? [{ before: id, earlier: index === 0 }]
          : [],
      );
    const sections: TranscriptSection[] = [];
    let offset = 0;
    let current: TranscriptSection = { messages: [] };
    for (const gap of gaps) {
      while (offset < messages.length && messages[offset].entryId < gap.before)
        current.messages.push(messages[offset++]);
      if (current.gap || current.messages.length) sections.push(current);
      current = { gap, messages: [] };
    }
    current.messages.push(...messages.slice(offset));
    sections.push(current);
    return sections;
  }
}

/** Keep existing root bookmarks while addressing forks within the same session. */
export function standaloneConversationPath(
  base: string,
  sessionId: string,
  conversationId: number | string,
) {
  return `${base}/${encodeURIComponent(sessionId)}${String(conversationId) === "1" ? "" : `/${encodeURIComponent(conversationId)}`}`;
}

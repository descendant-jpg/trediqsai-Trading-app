/**
 * Persistence helpers for the TradiQs Oracle chat conversation.
 *
 * The conversation is stored in AsyncStorage so traders can scroll back to
 * earlier AI analysis after closing the app.
 */

export interface OracleChatBubble {
  id: string;
  role: 'user' | 'ai';
  text: string;
  /** Marks a friendly error bubble so it can be styled/identified. */
  isError?: boolean;
}

/** AsyncStorage key for the persisted Oracle conversation. */
export const ORACLE_CHAT_STORAGE_KEY = 'oracle-chat-history-v1';

/** Keep only the most recent turns in storage. */
export const ORACLE_CHAT_STORAGE_LIMIT = 50;

/** Parse a stored conversation, dropping anything malformed. */
export function parseStoredMessages(raw: string | null): OracleChatBubble[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (m): m is OracleChatBubble =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as OracleChatBubble).id === 'string' &&
        ((m as OracleChatBubble).role === 'user' ||
          (m as OracleChatBubble).role === 'ai') &&
        typeof (m as OracleChatBubble).text === 'string',
    );
  } catch {
    return [];
  }
}

/** Messages worth persisting: skip the welcome greeting and error bubbles. */
export function persistableMessages(
  messages: OracleChatBubble[],
): OracleChatBubble[] {
  return messages
    .filter((m) => m.id !== 'welcome' && !m.isError)
    .slice(-ORACLE_CHAT_STORAGE_LIMIT);
}

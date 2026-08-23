import { describe, expect, it } from 'vitest';
import {
  ORACLE_CHAT_STORAGE_LIMIT,
  type OracleChatBubble,
  parseStoredMessages,
  persistableMessages,
} from '../oracleChatPersistence';

const user = (i: number): OracleChatBubble => ({
  id: `u-${i}`,
  role: 'user',
  text: `question ${i}`,
});
const ai = (i: number): OracleChatBubble => ({
  id: `a-${i}`,
  role: 'ai',
  text: `answer ${i}`,
});

describe('parseStoredMessages', () => {
  it('returns [] for null, invalid JSON, or non-arrays', () => {
    expect(parseStoredMessages(null)).toEqual([]);
    expect(parseStoredMessages('not json')).toEqual([]);
    expect(parseStoredMessages('{"a":1}')).toEqual([]);
  });

  it('round-trips a valid conversation', () => {
    const convo = [user(1), ai(1), user(2), ai(2)];
    expect(parseStoredMessages(JSON.stringify(convo))).toEqual(convo);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const raw = JSON.stringify([
      user(1),
      null,
      { id: 'x' }, // missing role/text
      { id: 'y', role: 'system', text: 'nope' }, // bad role
      ai(1),
    ]);
    expect(parseStoredMessages(raw)).toEqual([user(1), ai(1)]);
  });
});

describe('persistableMessages', () => {
  it('skips the welcome greeting and error bubbles', () => {
    const messages: OracleChatBubble[] = [
      { id: 'welcome', role: 'ai', text: 'hello' },
      user(1),
      { id: 'e-1', role: 'ai', text: 'error', isError: true },
      ai(1),
    ];
    expect(persistableMessages(messages)).toEqual([user(1), ai(1)]);
  });

  it('caps storage to the most recent turns', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      i % 2 === 0 ? user(i) : ai(i),
    );
    const kept = persistableMessages(many);
    expect(kept).toHaveLength(ORACLE_CHAT_STORAGE_LIMIT);
    expect(kept[kept.length - 1]).toEqual(many[many.length - 1]);
  });
});

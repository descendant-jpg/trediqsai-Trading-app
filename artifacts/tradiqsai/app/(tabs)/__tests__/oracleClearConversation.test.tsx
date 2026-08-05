// @vitest-environment jsdom
/**
 * "Clear conversation" contract tests for the Oracle chat screen.
 *
 * Guards against a regression where clearing quietly fails:
 * - Clearing removes the AsyncStorage key, and a subsequent rehydrate
 *   (fresh mount) yields only the welcome message.
 * - Clearing also resets pending error/retry state.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------

const { storage, getItem, setItem, removeItem } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const getItem = vi.fn((key: string) =>
    Promise.resolve(storage.get(key) ?? null),
  );
  const setItem = vi.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  });
  const removeItem = vi.fn((key: string) => {
    storage.delete(key);
    return Promise.resolve();
  });
  return { storage, getItem, setItem, removeItem };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem, setItem, removeItem },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

// Controllable Oracle chat mutation: 'error' makes every send fail.
const oracle = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'error',
}));
const sendOracleChat = vi.hoisted(() =>
  vi.fn(
    (
      _vars: unknown,
      opts: {
        onSuccess?: (res: { reply: string }) => void;
        onError?: (err: Error) => void;
      },
    ) => {
      if (oracle.mode === 'error') opts.onError?.(new Error('network down'));
      else opts.onSuccess?.({ reply: 'Oracle says: up only.' });
    },
  ),
);
vi.mock('@workspace/api-client-react', () => ({
  useSendOracleChat: () => ({ mutate: sendOracleChat, isPending: false }),
}));

// The screen reads the trading account to personalise Oracle answers —
// stub it with stable values so no TradingProvider is needed.
vi.mock('@/context/TradingContext', () => ({
  useTrading: () => ({
    balance: 10_000,
    equity: 10_000,
    position: null,
    unrealizedPnl: 0,
    drawdownUsed: 0,
    distanceToPayout: 1_000,
  }),
}));

import AiToolsScreen from '../ai-tools';
import { ORACLE_CHAT_STORAGE_KEY } from '@/lib/oracleChatPersistence';

// ---- Helpers ----------------------------------------------------------------

const STORED_CONVO = [
  { id: 'u-1', role: 'user', text: 'What about BTC?' },
  { id: 'a-1', role: 'ai', text: 'BTC looks strong today.' },
];

const WELCOME_TEXT =
  "I'm the TradiQs Oracle — your market AI. Ask me about any asset, sentiment, or today's movers.";

async function renderScreen() {
  const view = render(<AiToolsScreen />);
  // Let hydration (AsyncStorage.getItem) resolve.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

function clickClear() {
  fireEvent.click(screen.getByTestId('oracle-clear'));
}

beforeEach(() => {
  storage.clear();
  getItem.mockClear();
  setItem.mockClear();
  removeItem.mockClear();
  sendOracleChat.mockClear();
  oracle.mode = 'success';
  // Platform.OS is 'web' under react-native-web, so clearing confirms
  // via window.confirm — auto-accept it.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- Tests ------------------------------------------------------------------

describe('Oracle chat — clear conversation', () => {
  it('removes the stored key, and rehydrating afterwards yields only the welcome message', async () => {
    storage.set(ORACLE_CHAT_STORAGE_KEY, JSON.stringify(STORED_CONVO));

    const view = await renderScreen();
    // Sanity: the stored conversation rehydrated.
    expect(screen.getByText('BTC looks strong today.')).toBeTruthy();

    await act(async () => {
      clickClear();
      await Promise.resolve();
    });

    // The storage key was actually removed.
    expect(removeItem).toHaveBeenCalledWith(ORACLE_CHAT_STORAGE_KEY);
    // Whatever the persist effect wrote afterwards must not resurrect the
    // old chat: the stored value (if any) contains no conversation turns.
    const raw = storage.get(ORACLE_CHAT_STORAGE_KEY);
    if (raw !== undefined) {
      expect(JSON.parse(raw)).toEqual([]);
    }

    // In-memory state reset to the welcome message only.
    expect(screen.queryByText('BTC looks strong today.')).toBeNull();
    expect(screen.getByText(WELCOME_TEXT)).toBeTruthy();

    // Simulate an app restart: fresh mount rehydrates from storage.
    view.unmount();
    await renderScreen();
    expect(screen.getByText(WELCOME_TEXT)).toBeTruthy();
    expect(screen.queryByText('BTC looks strong today.')).toBeNull();
    expect(screen.queryByText('What about BTC?')).toBeNull();
  });

  it('does nothing when the user cancels the confirmation', async () => {
    storage.set(ORACLE_CHAT_STORAGE_KEY, JSON.stringify(STORED_CONVO));
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await renderScreen();
    await act(async () => {
      clickClear();
      await Promise.resolve();
    });

    expect(removeItem).not.toHaveBeenCalled();
    expect(screen.getByText('BTC looks strong today.')).toBeTruthy();
  });

  it('resets pending error/retry state', async () => {
    oracle.mode = 'error';
    await renderScreen();

    // Send a message that fails → error bubble with a Retry button.
    await act(async () => {
      fireEvent.click(screen.getByTestId('chip-Analyze BTC/USD'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('oracle-retry')).toBeTruthy();

    await act(async () => {
      clickClear();
      await Promise.resolve();
    });

    // Error bubble and retry affordance are gone; only the welcome remains.
    expect(screen.queryByTestId('oracle-retry')).toBeNull();
    expect(screen.queryByText('Analyze BTC/USD')).toBeTruthy(); // chip still there
    expect(screen.getByText(WELCOME_TEXT)).toBeTruthy();

    // The failed text is no longer pending: the next send is a fresh turn,
    // not a retry — exactly one new mutation with only the new message.
    sendOracleChat.mockClear();
    oracle.mode = 'success';
    await act(async () => {
      fireEvent.click(screen.getByTestId('chip-Daily Movers'));
      await Promise.resolve();
    });
    expect(sendOracleChat).toHaveBeenCalledTimes(1);
    const vars = sendOracleChat.mock.calls[0][0] as {
      data: { messages: Array<{ role: string; content: string }> };
    };
    expect(vars.data.messages).toEqual([
      { role: 'user', content: 'Daily Movers' },
    ]);
  });
});

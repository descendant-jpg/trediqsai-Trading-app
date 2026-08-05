// @vitest-environment jsdom
/**
 * "Chat can't be saved" notice contract tests for the Oracle chat screen.
 *
 * Guards against a regression that would reintroduce silent data loss:
 * - The warning (testID `oracle-persist-warning`) appears only after
 *   ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD consecutive AsyncStorage.setItem
 *   failures.
 * - A subsequent successful write clears the warning.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------

const { storage, failures, getItem, setItem, removeItem } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  // When `failures.mode` is true, every setItem rejects.
  const failures = { mode: false };
  const getItem = vi.fn((key: string) =>
    Promise.resolve(storage.get(key) ?? null),
  );
  const setItem = vi.fn((key: string, value: string) => {
    if (failures.mode) return Promise.reject(new Error('disk full'));
    storage.set(key, value);
    return Promise.resolve();
  });
  const removeItem = vi.fn((key: string) => {
    storage.delete(key);
    return Promise.resolve();
  });
  return { storage, failures, getItem, setItem, removeItem };
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

const sendOracleChat = vi.hoisted(() =>
  vi.fn(
    (
      _vars: unknown,
      opts: { onSuccess?: (res: { reply: string }) => void },
    ) => {
      opts.onSuccess?.({ reply: 'Oracle says: up only.' });
    },
  ),
);
vi.mock('@workspace/api-client-react', () => ({
  useSendOracleChat: () => ({ mutate: sendOracleChat, isPending: false }),
}));

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
import { ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD } from '@/lib/oracleChatPersistence';

// ---- Helpers ----------------------------------------------------------------

async function renderScreen() {
  const view = render(<AiToolsScreen />);
  // Let hydration (AsyncStorage.getItem) resolve, plus the first persist write.
  await flush();
  return view;
}

/** Flush pending microtasks (promise resolutions) inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Trigger one persist attempt by sending a message (each send changes
 * `messages`, which runs the persist effect once — the AI reply arrives
 * synchronously in the same update thanks to the mocked mutation).
 */
async function sendMessage(text: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId('oracle-input'), {
      target: { value: text },
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId('oracle-send'));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  storage.clear();
  failures.mode = false;
  getItem.mockClear();
  setItem.mockClear();
  removeItem.mockClear();
  sendOracleChat.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- Tests ------------------------------------------------------------------

describe('Oracle chat — persist-failure warning', () => {
  it('shows the warning only after the failure threshold is reached', async () => {
    await renderScreen();
    expect(screen.queryByTestId('oracle-persist-warning')).toBeNull();

    failures.mode = true;
    setItem.mockClear();

    // Keep sending until we've accumulated exactly threshold-1 failed
    // writes: the warning must not show yet. (A single send can trigger
    // more than one persist write — user turn + AI reply — so count the
    // actual setItem failures rather than sends.)
    let turn = 0;
    while (setItem.mock.calls.length < ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD - 1) {
      await sendMessage(`turn ${++turn}`);
      if (setItem.mock.calls.length < ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD) {
        expect(screen.queryByTestId('oracle-persist-warning')).toBeNull();
      }
    }

    // Crossing the threshold surfaces the warning.
    while (setItem.mock.calls.length < ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD) {
      await sendMessage(`turn ${++turn}`);
    }
    expect(setItem.mock.calls.length).toBeGreaterThanOrEqual(
      ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD,
    );
    expect(screen.getByTestId('oracle-persist-warning')).toBeTruthy();
  });

  it('clears the warning after a subsequent successful write', async () => {
    await renderScreen();

    failures.mode = true;
    for (let i = 0; i < ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD; i++) {
      await sendMessage(`fail ${i}`);
    }
    expect(screen.getByTestId('oracle-persist-warning')).toBeTruthy();

    // Storage recovers — the next write succeeds and the notice disappears.
    failures.mode = false;
    await sendMessage('storage is back');
    expect(screen.queryByTestId('oracle-persist-warning')).toBeNull();
  });
});

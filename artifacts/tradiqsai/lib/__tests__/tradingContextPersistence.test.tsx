// @vitest-environment jsdom
/**
 * Component-level persistence tests for TradingContext.
 *
 * Verifies the "never lose a trade closed right before quitting" contract:
 * - Closing a trade persists immediately (updated balance + history).
 * - Price ticks alone do NOT trigger AsyncStorage writes.
 * - Backgrounding the app flushes the latest price.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing TradingContext) --------------

const { storage, getItem, setItem } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const getItem = vi.fn((key: string) =>
    Promise.resolve(storage.get(key) ?? null),
  );
  const setItem = vi.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  });
  return { storage, getItem, setItem };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem, setItem },
}));

type AppStateListener = (state: string) => void;
const appState = vi.hoisted(() => ({
  listeners: [] as Array<(state: string) => void>,
}));

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: AppStateListener) => {
      appState.listeners.push(listener);
      return {
        remove: () => {
          appState.listeners = appState.listeners.filter(
            (l) => l !== listener,
          );
        },
      };
    },
  },
}));

import {
  TradingProvider,
  useTrading,
  STARTING_BALANCE,
} from '@/context/TradingContext';
import { STORAGE_KEY, type PersistedState } from '@/lib/persistedState';

// ---- Helpers ----------------------------------------------------------------

type TradingValue = ReturnType<typeof useTrading>;

let latest: TradingValue | null = null;

function Probe() {
  latest = useTrading();
  return null;
}

function lastWrite(): PersistedState {
  expect(setItem).toHaveBeenCalled();
  const [key, raw] = setItem.mock.calls[setItem.mock.calls.length - 1];
  expect(key).toBe(STORAGE_KEY);
  return JSON.parse(raw) as PersistedState;
}

async function renderProvider() {
  const view = render(
    <TradingProvider>
      <Probe />
    </TradingProvider>,
  );
  // Let the async hydration (AsyncStorage.getItem) resolve.
  await act(async () => {
    await Promise.resolve();
  });
  expect(latest!.ready).toBe(true);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear();
  getItem.mockClear();
  setItem.mockClear();
  appState.listeners = [];
  latest = null;
  // Deterministic price ticks.
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---- Tests -------------------------------------------------------------------

describe('TradingContext persistence', () => {
  it('persists immediately when a trade is closed, with updated balance and history', async () => {
    await renderProvider();

    // Open a long position.
    act(() => {
      latest!.buy();
    });
    const afterOpen = lastWrite();
    expect(afterOpen.position).not.toBeNull();
    expect(afterOpen.position!.side).toBe('LONG');

    // Move the price so the close realizes P&L.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    setItem.mockClear();

    // Close the position (SELL closes an open long) — this is the trade the
    // user makes right before quitting the app.
    let result: ReturnType<TradingValue['sell']>;
    act(() => {
      result = latest!.sell();
    });
    expect(result!.kind).toBe('closed');
    const trade = (result! as { kind: 'closed'; trade: { pnl: number } }).trade;

    // The close persisted immediately — no timers advanced, no backgrounding.
    expect(setItem).toHaveBeenCalledTimes(1);
    const persisted = lastWrite();
    expect(persisted.position).toBeNull();
    expect(persisted.history).toHaveLength(1);
    expect(persisted.history[0].pnl).toBe(trade.pnl);
    expect(persisted.balance).toBe(+(STARTING_BALANCE + trade.pnl).toFixed(2));
    expect(persisted.balance).toBe(latest!.balance);
  });

  it('does not write on price ticks alone, but flushes the latest price on backgrounding', async () => {
    await renderProvider();
    setItem.mockClear();

    // Price ticks for 10 seconds (well under the 30s throttle) — no writes.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(setItem).not.toHaveBeenCalled();
    const tickedPrice = latest!.price;
    expect(tickedPrice).not.toBe(2_350); // ticker actually moved the price

    // Backgrounding flushes exactly one write with the latest price.
    act(() => {
      appState.listeners.forEach((l) => l('background'));
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(lastWrite().lastPrice).toBe(tickedPrice);
  });

  it('flushes the latest price via the 30s throttle interval', async () => {
    await renderProvider();
    setItem.mockClear();

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(setItem).not.toHaveBeenCalled();
    // The latest price the app has rendered before the throttle fires.
    const priceBeforeFlush = latest!.price;

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(lastWrite().lastPrice).toBe(priceBeforeFlush);
  });
});

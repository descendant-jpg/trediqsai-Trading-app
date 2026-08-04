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
  DAILY_DRAWDOWN_LIMIT,
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

  it('resets the daily loss when the calendar day rolls over while running', async () => {
    // Start just before LOCAL midnight with a loss already realized today.
    // (Local-time Date constructor — the day key is the device's local date.)
    vi.setSystemTime(new Date(2026, 7, 4, 23, 59, 0));
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        balance: STARTING_BALANCE - 500,
        realizedLossToday: 500,
        day: '2026-08-04',
        tradingDayTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        position: null,
        history: [],
        lastPrice: 2350,
      } satisfies PersistedState),
    );

    await renderProvider();
    expect(latest!.drawdownUsed).toBeGreaterThan(0);

    // Cross midnight while the app stays open. The 30s rollover check fires.
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });

    expect(latest!.drawdownUsed).toBe(0);
    // The persisted state now stamps the new day with a zeroed loss.
    const persisted = lastWrite();
    expect(persisted.day).toBe('2026-08-05');
    expect(persisted.realizedLossToday).toBe(0);
  });

  it('does not block a trade placed right after midnight, before the periodic check fires', async () => {
    // Yesterday's losses maxed out the daily limit. Just before LOCAL midnight.
    vi.setSystemTime(new Date(2026, 7, 4, 23, 59, 59));
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        balance: STARTING_BALANCE - DAILY_DRAWDOWN_LIMIT,
        realizedLossToday: DAILY_DRAWDOWN_LIMIT,
        day: '2026-08-04',
        tradingDayTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        position: null,
        history: [],
        lastPrice: 2350,
      } satisfies PersistedState),
    );

    await renderProvider();
    expect(latest!.drawdownUsed).toBe(1);
    // Sanity check: trading is blocked before midnight.
    let blocked: ReturnType<TradingValue['buy']>;
    act(() => {
      blocked = latest!.buy();
    });
    expect(blocked!.kind).toBe('blocked');

    // Cross midnight with only 2s elapsed — well before the 30s rollover
    // check — and trade immediately while the app stays active.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    let result: ReturnType<TradingValue['buy']>;
    act(() => {
      result = latest!.buy();
    });
    expect(result!.kind).toBe('opened');
    expect(latest!.drawdownUsed).toBe(0);
  });

  it('resets the daily loss on foregrounding after midnight', async () => {
    // Just before LOCAL midnight.
    vi.setSystemTime(new Date(2026, 7, 4, 23, 59, 50));
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        balance: STARTING_BALANCE - 300,
        realizedLossToday: 300,
        day: '2026-08-04',
        tradingDayTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        position: null,
        history: [],
        lastPrice: 2350,
      } satisfies PersistedState),
    );

    await renderProvider();
    expect(latest!.drawdownUsed).toBeGreaterThan(0);

    // Background the app, cross midnight without hitting the 30s interval
    // (timers don't run in background on a real device; simulate by only
    // moving the clock), then foreground.
    act(() => {
      appState.listeners.forEach((l) => l('background'));
    });
    vi.setSystemTime(new Date(2026, 7, 5, 0, 0, 5));
    act(() => {
      appState.listeners.forEach((l) => l('active'));
    });

    expect(latest!.drawdownUsed).toBe(0);
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

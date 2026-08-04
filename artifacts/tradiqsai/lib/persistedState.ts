/**
 * Pure hydration logic for persisted trading simulator state.
 * Kept free of React/React Native imports so it can be unit tested.
 */

import {
  STARTING_BALANCE,
  type ClosedTrade,
  type Position,
  type Side,
} from './tradingLogic';

export const STORAGE_KEY = 'tradiqs.sim.v1';

export interface PersistedState {
  balance: number;
  realizedLossToday: number;
  day: string;
  position: Position | null;
  history: ClosedTrade[];
  lastPrice: number;
}

/** State the trading provider hydrates from a persisted payload. */
export interface HydratedState {
  balance: number;
  realizedLossToday: number;
  position: Position | null;
  history: ClosedTrade[];
  /** Last known price, or null if none was persisted. */
  lastPrice: number | null;
}

const DEFAULT_STATE: HydratedState = {
  balance: STARTING_BALANCE,
  realizedLossToday: 0,
  position: null,
  history: [],
  lastPrice: null,
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isSide(v: unknown): v is Side {
  return v === 'LONG' || v === 'SHORT';
}

function sanitizePosition(v: unknown): Position | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (
    isSide(p.side) &&
    isFiniteNumber(p.entryPrice) &&
    isFiniteNumber(p.size) &&
    isFiniteNumber(p.openedAt)
  ) {
    return {
      side: p.side,
      entryPrice: p.entryPrice,
      size: p.size,
      openedAt: p.openedAt,
    };
  }
  return null;
}

function sanitizeHistory(v: unknown): ClosedTrade[] {
  if (!Array.isArray(v)) return [];
  const trades: ClosedTrade[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const t = item as Record<string, unknown>;
    if (
      isSide(t.side) &&
      isFiniteNumber(t.entryPrice) &&
      isFiniteNumber(t.exitPrice) &&
      isFiniteNumber(t.size) &&
      isFiniteNumber(t.pnl) &&
      isFiniteNumber(t.closedAt)
    ) {
      trades.push({
        side: t.side,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        size: t.size,
        pnl: t.pnl,
        closedAt: t.closedAt,
      });
    }
  }
  return trades;
}

/**
 * Parse a raw persisted payload into safe hydration state.
 *
 * - Corrupt JSON or a non-object payload yields fresh defaults.
 * - Missing or invalid fields fall back to safe defaults individually.
 * - Extra/unknown fields are ignored.
 * - `realizedLossToday` resets to 0 when the persisted day differs from
 *   `today` (the daily drawdown is per-day).
 */
export function hydratePersistedState(
  raw: string | null | undefined,
  today: string,
): HydratedState {
  if (!raw) return { ...DEFAULT_STATE };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_STATE };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_STATE };
  }
  const s = parsed as Record<string, unknown>;

  const sameDay = typeof s.day === 'string' && s.day === today;
  const realizedLossToday =
    sameDay && isFiniteNumber(s.realizedLossToday) && s.realizedLossToday >= 0
      ? s.realizedLossToday
      : 0;

  return {
    balance: isFiniteNumber(s.balance) ? s.balance : STARTING_BALANCE,
    realizedLossToday,
    position: sanitizePosition(s.position),
    history: sanitizeHistory(s.history),
    lastPrice:
      isFiniteNumber(s.lastPrice) && s.lastPrice > 0 ? s.lastPrice : null,
  };
}

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

/**
 * Day key for the daily drawdown, derived from the device's LOCAL calendar
 * date (YYYY-MM-DD) — the daily loss limit resets at the trader's local
 * midnight, not UTC. A persisted UTC-based key from older versions simply
 * mismatches once and resets the loss to 0, which is acceptable.
 */
export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The device's current IANA timezone, falling back to UTC when unknown. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
  } catch {
    // fall through
  }
  return 'UTC';
}

/** True when `tz` is an IANA timezone the runtime can format dates in. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Day key (YYYY-MM-DD) for the daily drawdown, derived from the trader's
 * PINNED trading-day timezone rather than the device's current zone, so a
 * device timezone change (travel, manual change) never resets the daily
 * loss early or delays the reset. Falls back to the device-local date when
 * the zone can't be formatted.
 */
export function dayKeyInZone(timeZone: string, date: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return localDayKey(date);
  }
}

export interface PersistedState {
  balance: number;
  realizedLossToday: number;
  day: string;
  /** Pinned IANA timezone the trading day rolls over in. */
  tradingDayTz: string;
  position: Position | null;
  history: ClosedTrade[];
  lastPrice: number;
}

/** State the trading provider hydrates from a persisted payload. */
export interface HydratedState {
  balance: number;
  realizedLossToday: number;
  /** Pinned IANA timezone the trading day rolls over in. */
  tradingDayTz: string;
  position: Position | null;
  history: ClosedTrade[];
  /** Last known price, or null if none was persisted. */
  lastPrice: number | null;
}

function defaultState(): HydratedState {
  return {
    balance: STARTING_BALANCE,
    realizedLossToday: 0,
    tradingDayTz: deviceTimeZone(),
    position: null,
    history: [],
    lastPrice: null,
  };
}

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
 * - The trading-day timezone is the persisted `tradingDayTz` when valid,
 *   otherwise the current device timezone (first launch / older payloads).
 * - `realizedLossToday` resets to 0 when the persisted day differs from
 *   today's day key IN THE PINNED TIMEZONE (the daily drawdown is per-day,
 *   and a device timezone change must not move the reset).
 */
export function hydratePersistedState(
  raw: string | null | undefined,
  now: Date = new Date(),
): HydratedState {
  if (!raw) return defaultState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultState();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaultState();
  }
  const s = parsed as Record<string, unknown>;

  const tradingDayTz = isValidTimeZone(s.tradingDayTz)
    ? s.tradingDayTz
    : deviceTimeZone();
  const today = dayKeyInZone(tradingDayTz, now);
  const sameDay = typeof s.day === 'string' && s.day === today;
  const realizedLossToday =
    sameDay && isFiniteNumber(s.realizedLossToday) && s.realizedLossToday >= 0
      ? s.realizedLossToday
      : 0;

  return {
    balance: isFiniteNumber(s.balance) ? s.balance : STARTING_BALANCE,
    realizedLossToday,
    tradingDayTz,
    position: sanitizePosition(s.position),
    history: sanitizeHistory(s.history),
    lastPrice:
      isFiniteNumber(s.lastPrice) && s.lastPrice > 0 ? s.lastPrice : null,
  };
}

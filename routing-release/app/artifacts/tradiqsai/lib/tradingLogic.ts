/**
 * Pure trading rules for the TradiQs simulated funded account.
 * Kept free of React/React Native imports so it can be unit tested.
 */

export const STARTING_BALANCE = 100_000;
export const PAYOUT_TARGET = 104_500; // balance needed for payout
export const DAILY_DRAWDOWN_LIMIT = 5_000;
export const POSITION_SIZE = 10; // units per trade

export type Side = 'LONG' | 'SHORT';

export interface Position {
  side: Side;
  entryPrice: number;
  size: number;
  openedAt: number;
}

export interface ClosedTrade {
  side: Side;
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  closedAt: number;
}

export type OrderDecision =
  | { action: 'open' }
  | { action: 'close' }
  | { action: 'blocked'; reason: string };

/** Signed P&L of an open position at the given price. */
export function positionPnl(position: Position, price: number): number {
  const diff = price - position.entryPrice;
  return (position.side === 'LONG' ? diff : -diff) * position.size;
}

/**
 * Pure order-routing rules:
 * - An opposite-side order ALWAYS closes an open position, even when the
 *   daily drawdown limit is exhausted (traders must be able to exit).
 * - A same-side order while a position is open is blocked (no adding).
 * - Opening NEW exposure is blocked once the drawdown limit is used up.
 */
export function decideOrder(
  position: Position | null,
  side: Side,
  drawdownUsed: number,
): OrderDecision {
  if (position) {
    if (position.side !== side) return { action: 'close' };
    return {
      action: 'blocked',
      reason: `You already have a ${position.side} open. Tap ${
        side === 'LONG' ? 'SELL' : 'BUY'
      } to close it.`,
    };
  }
  if (drawdownUsed >= 1) {
    return {
      action: 'blocked',
      reason: 'Daily drawdown limit reached. Trading paused until tomorrow.',
    };
  }
  return { action: 'open' };
}

/**
 * Fraction (0..1) of the daily drawdown limit consumed. Counts realized
 * losses plus any unrealized LOSS (unrealized profit never reduces usage).
 */
export function computeDrawdownUsed(
  realizedLossToday: number,
  unrealizedPnl: number,
  limit: number = DAILY_DRAWDOWN_LIMIT,
): number {
  return Math.min(
    Math.max((realizedLossToday + Math.max(-unrealizedPnl, 0)) / limit, 0),
    1,
  );
}

/**
 * Settle a position close at the given price: the resulting trade record,
 * new balance, and how much realized daily loss to add (0 for winners).
 */
export function settleClose(
  position: Position,
  price: number,
  balance: number,
  closedAt: number,
): { trade: ClosedTrade; newBalance: number; realizedLossDelta: number } {
  const pnl = +positionPnl(position, price).toFixed(2);
  const trade: ClosedTrade = {
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice: price,
    size: position.size,
    pnl,
    closedAt,
  };
  return {
    trade,
    newBalance: +(balance + pnl).toFixed(2),
    realizedLossDelta: pnl < 0 ? -pnl : 0,
  };
}

/** Dollars of profit still needed to reach payout (never negative). */
export function distanceToPayout(
  equity: number,
  target: number = PAYOUT_TARGET,
): number {
  return Math.max(0, +(target - equity).toFixed(2));
}

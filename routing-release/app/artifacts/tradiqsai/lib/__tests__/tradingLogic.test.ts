import { describe, expect, it } from 'vitest';
import {
  DAILY_DRAWDOWN_LIMIT,
  PAYOUT_TARGET,
  computeDrawdownUsed,
  decideOrder,
  distanceToPayout,
  positionPnl,
  settleClose,
  type Position,
} from '../tradingLogic';

const long = (entryPrice: number, size = 10): Position => ({
  side: 'LONG',
  entryPrice,
  size,
  openedAt: 0,
});
const short = (entryPrice: number, size = 10): Position => ({
  side: 'SHORT',
  entryPrice,
  size,
  openedAt: 0,
});

describe('positionPnl', () => {
  it('long profits when price rises', () => {
    expect(positionPnl(long(2350), 2360)).toBe(100);
  });

  it('long loses when price falls', () => {
    expect(positionPnl(long(2350), 2340)).toBe(-100);
  });

  it('short profits when price falls', () => {
    expect(positionPnl(short(2350), 2340)).toBe(100);
  });

  it('short loses when price rises', () => {
    expect(positionPnl(short(2350), 2360)).toBe(-100);
  });

  it('scales with position size', () => {
    expect(positionPnl(long(100, 3), 110)).toBe(30);
  });

  it('is zero at entry price', () => {
    expect(positionPnl(long(2350), 2350)).toBe(0);
    expect(positionPnl(short(2350), 2350)).toBe(-0);
  });
});

describe('decideOrder', () => {
  it('opens when flat and under the drawdown limit', () => {
    expect(decideOrder(null, 'LONG', 0)).toEqual({ action: 'open' });
    expect(decideOrder(null, 'SHORT', 0.99)).toEqual({ action: 'open' });
  });

  it('blocks new exposure once the drawdown limit is used up', () => {
    const d = decideOrder(null, 'LONG', 1);
    expect(d.action).toBe('blocked');
    expect(d).toMatchObject({ reason: expect.stringContaining('drawdown') });
  });

  it('an opposite-side order closes the open position', () => {
    expect(decideOrder(long(2350), 'SHORT', 0)).toEqual({ action: 'close' });
    expect(decideOrder(short(2350), 'LONG', 0)).toEqual({ action: 'close' });
  });

  it('closing is ALWAYS allowed, even with drawdown exhausted', () => {
    expect(decideOrder(long(2350), 'SHORT', 1)).toEqual({ action: 'close' });
  });

  it('blocks adding to an existing same-side position', () => {
    const d = decideOrder(long(2350), 'LONG', 0);
    expect(d.action).toBe('blocked');
    expect(d).toMatchObject({ reason: expect.stringContaining('LONG') });
  });
});

describe('computeDrawdownUsed', () => {
  it('is 0 with no losses', () => {
    expect(computeDrawdownUsed(0, 0)).toBe(0);
  });

  it('counts realized losses against the limit', () => {
    expect(computeDrawdownUsed(DAILY_DRAWDOWN_LIMIT / 2, 0)).toBe(0.5);
  });

  it('counts unrealized LOSSES but not unrealized profits', () => {
    expect(computeDrawdownUsed(0, -DAILY_DRAWDOWN_LIMIT / 4)).toBe(0.25);
    expect(computeDrawdownUsed(0, +DAILY_DRAWDOWN_LIMIT)).toBe(0);
  });

  it('unrealized profit never offsets realized losses', () => {
    expect(computeDrawdownUsed(DAILY_DRAWDOWN_LIMIT / 2, 10_000)).toBe(0.5);
  });

  it('combines realized and unrealized losses', () => {
    expect(computeDrawdownUsed(2_000, -2_000, 5_000)).toBe(0.8);
  });

  it('clamps to 1 when losses exceed the limit', () => {
    expect(computeDrawdownUsed(DAILY_DRAWDOWN_LIMIT * 2, -1_000)).toBe(1);
  });
});

describe('settleClose', () => {
  it('realizes a win into the balance with no loss delta', () => {
    const { trade, newBalance, realizedLossDelta } = settleClose(
      long(2350),
      2360,
      100_000,
      123,
    );
    expect(trade).toEqual({
      side: 'LONG',
      entryPrice: 2350,
      exitPrice: 2360,
      size: 10,
      pnl: 100,
      closedAt: 123,
    });
    expect(newBalance).toBe(100_100);
    expect(realizedLossDelta).toBe(0);
  });

  it('realizes a loss into both balance and daily loss', () => {
    const { trade, newBalance, realizedLossDelta } = settleClose(
      short(2350),
      2360,
      100_000,
      0,
    );
    expect(trade.pnl).toBe(-100);
    expect(newBalance).toBe(99_900);
    expect(realizedLossDelta).toBe(100);
  });

  it('rounds P&L and balance to cents', () => {
    const { trade, newBalance } = settleClose(
      long(2350.111, 3),
      2350.222,
      100_000.005,
      0,
    );
    expect(trade.pnl).toBe(0.33);
    expect(newBalance).toBe(100_000.34);
  });
});

describe('distanceToPayout', () => {
  it('is the remaining profit needed below the target', () => {
    expect(distanceToPayout(PAYOUT_TARGET - 1_000)).toBe(1_000);
  });

  it('never goes negative once the target is reached', () => {
    expect(distanceToPayout(PAYOUT_TARGET)).toBe(0);
    expect(distanceToPayout(PAYOUT_TARGET + 5_000)).toBe(0);
  });

  it('rounds to cents', () => {
    expect(distanceToPayout(PAYOUT_TARGET - 0.005)).toBe(0.01);
  });
});

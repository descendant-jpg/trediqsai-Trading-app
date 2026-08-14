import { describe, expect, it } from 'vitest';
import { calculateExpectancy, calculateLotSize, calculateMargin, calculatePricePnL, keepAvailableLessons, parseCompletedLessons } from '../academyMath';

describe('Academy learning progress', () => {
  it('restores unique completed lesson IDs and rejects malformed persistence', () => {
    expect(parseCompletedLessons('["pips-spreads","pips-spreads","bos-choch"]')).toEqual(['pips-spreads', 'bos-choch']);
    expect(parseCompletedLessons('not-json')).toEqual([]);
    expect(parseCompletedLessons('{"lesson":"pips-spreads"}')).toEqual([]);
  });
  it('removes legacy IDs that are no longer available in the curriculum', () => {
    const saved = parseCompletedLessons('["candlestick-psychology","pips-spreads","order-blocks"]');
    expect(keepAvailableLessons(saved, new Set(['candlestick-psychology', 'order-blocks']))).toEqual(['candlestick-psychology', 'order-blocks']);
  });
});

describe('Academy calculators', () => {
  it('calculates lot size from balance, fixed risk, and stop distance', () => {
    expect(calculateLotSize(10000, 1, 25)).toEqual({ riskAmount: 100, lots: 0.4 });
    expect(calculateLotSize(10000, 0, 25)).toBeNull();
  });
  it('calculates expectancy and rejects invalid win-rate ranges', () => {
    expect(calculateExpectancy(45, 2)).toBeCloseTo(0.35);
    expect(calculateExpectancy(101, 2)).toBeNull();
  });
  it('calculates price-based P/L and required margin', () => {
    const pnl = calculatePricePnL(1.1, 1.105, 1.098, 0.1);
    expect(pnl?.profit).toBeCloseTo(50);
    expect(pnl?.loss).toBeCloseTo(20);
    expect(pnl?.rewardRisk).toBeCloseTo(2.5);
    expect(calculateMargin(100000, 50)).toBe(2000);
    expect(calculateMargin(100000, 0)).toBeNull();
  });
});
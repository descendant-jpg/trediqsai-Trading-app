import { describe, expect, it } from 'vitest';
import { calculateUserRank } from '../rankLogic';

describe('calculateUserRank', () => {
  it.each([
    [0, 100, 'Bronze'],
    [999.99, 80, 'Bronze'],
    [1000, 0, 'Silver'],
    [5000, 49.99, 'Silver'],
    [5000, 50, 'Gold'],
    [15000, 54.99, 'Gold'],
    [15000, 55, 'Elite'],
  ])('maps pnl=%s and winRate=%s to %s', (pnl, winRate, expected) => {
    expect(calculateUserRank(pnl, winRate)).toBe(expected);
  });
});
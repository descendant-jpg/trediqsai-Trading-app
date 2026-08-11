export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Elite';

/**
 * Threshold gating deliberately evaluates the highest tier first so a weak
 * win rate can never be bypassed by P&L alone.
 */
export function calculateUserRank(pnl: number, winRate: number): RankTier {
  const safePnl = Number.isFinite(pnl) ? pnl : 0;
  const safeWinRate = Number.isFinite(winRate) ? winRate : 0;

  if (safePnl >= 15_000 && safeWinRate >= 55) return 'Elite';
  if (safePnl >= 5_000 && safeWinRate >= 50) return 'Gold';
  if (safePnl >= 1_000) return 'Silver';
  return 'Bronze';
}
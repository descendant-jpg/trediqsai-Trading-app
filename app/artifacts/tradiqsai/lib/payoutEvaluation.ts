export const DEMO_STARTING_BALANCE = 10_000;
export const PRO_PAYOUT_SPLIT = 0.05;
export const ELITE_PAYOUT_SPLIT = 0.1;
export const PRO_MONTHLY_PAYOUT_CAP = 250;
export const ELITE_MONTHLY_PAYOUT_CAP = 500;
export const DAILY_DRAWDOWN_LIMIT = 500;
export const TOTAL_EQUITY_FLOOR = 9_000;
export const MINIMUM_ACTIVE_DAYS = 6;

export type PayoutPlan = 'PRO' | 'ELITE';

export interface PayoutEvaluation {
  plan: PayoutPlan;
  startingDemoBalance: number;
  virtualProfit: number;
  profitSplit: number;
  monthlyCap: number;
  monthlyPaid: number;
  cashoutValue: number;
  dailyLoss: number;
  totalEquity: number;
  activeDays: number;
  violated: boolean;
  violationReason: string | null;
  eligible: boolean;
  lockReason: string | null;
}

type UnknownRecord = Record<string, unknown>;

function validMoney(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}

/**
 * Validates the security-definer RPC response before it reaches the payout UI.
 * Any missing or malformed field deliberately becomes `null`, which keeps the
 * client locked rather than guessing that a payout is safe.
 */
export function parsePayoutEvaluation(value: unknown): PayoutEvaluation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as UnknownRecord;
  const plan = row.plan === 'PRO' || row.plan === 'ELITE' ? row.plan : null;
  if (
    !plan ||
    row.starting_demo_balance !== DEMO_STARTING_BALANCE ||
    !validMoney(row.virtual_profit) ||
    !validMoney(row.profit_split) ||
    !validMoney(row.monthly_cap) ||
    !validMoney(row.monthly_paid) ||
    !validMoney(row.cashout_value) ||
    !validMoney(row.daily_loss) ||
    !validMoney(row.total_equity) ||
    !Number.isInteger(row.active_days) ||
    (typeof row.violated !== 'boolean') ||
    (typeof row.eligible !== 'boolean') ||
    (row.violation_reason !== null && typeof row.violation_reason !== 'string') ||
    (row.lock_reason !== null && typeof row.lock_reason !== 'string')
  ) {
    return null;
  }

  const expectedSplit = plan === 'ELITE' ? ELITE_PAYOUT_SPLIT : PRO_PAYOUT_SPLIT;
  const expectedCap = plan === 'ELITE' ? ELITE_MONTHLY_PAYOUT_CAP : PRO_MONTHLY_PAYOUT_CAP;
  const expectedValue = Math.min(
    Math.max(0, Number(row.virtual_profit) * expectedSplit),
    Math.max(0, expectedCap - Number(row.monthly_paid)),
  );

  // The UI never upgrades or inflates a server result. Reject inconsistent
  // responses rather than displaying a payout value that cannot be requested.
  if (
    Number(row.profit_split) !== expectedSplit ||
    Number(row.monthly_cap) !== expectedCap ||
    Math.abs(Number(row.cashout_value) - expectedValue) > 0.01 ||
    Number(row.active_days) < 0
  ) {
    return null;
  }

  return {
    plan,
    startingDemoBalance: DEMO_STARTING_BALANCE,
    virtualProfit: Number(row.virtual_profit),
    profitSplit: expectedSplit,
    monthlyCap: expectedCap,
    monthlyPaid: Number(row.monthly_paid),
    cashoutValue: Number(row.cashout_value),
    dailyLoss: Number(row.daily_loss),
    totalEquity: Number(row.total_equity),
    activeDays: Number(row.active_days),
    violated: row.violated,
    violationReason: row.violation_reason as string | null,
    eligible: row.eligible,
    lockReason: row.lock_reason as string | null,
  };
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
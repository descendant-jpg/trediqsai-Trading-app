import { describe, expect, it } from 'vitest';
import {
  ELITE_MONTHLY_PAYOUT_CAP,
  parsePayoutEvaluation,
  PRO_MONTHLY_PAYOUT_CAP,
} from '../payoutEvaluation';

function summary(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'PRO',
    starting_demo_balance: 10_000,
    virtual_profit: 8_000,
    profit_split: 0.05,
    monthly_cap: PRO_MONTHLY_PAYOUT_CAP,
    monthly_paid: 0,
    cashout_value: 250,
    daily_loss: 0,
    total_equity: 18_000,
    active_days: 6,
    violated: false,
    violation_reason: null,
    eligible: true,
    lock_reason: null,
    ...overrides,
  };
}

describe('payout evaluation response validation', () => {
  it('accepts the capped Pro cashout returned by the server', () => {
    expect(parsePayoutEvaluation(summary())).toMatchObject({
      cashoutValue: PRO_MONTHLY_PAYOUT_CAP,
      eligible: true,
      plan: 'PRO',
    });
  });

  it('accepts the Elite 10% split but never more than its $500 cap', () => {
    const result = parsePayoutEvaluation(summary({
      plan: 'ELITE',
      virtual_profit: 9_000,
      profit_split: 0.1,
      monthly_cap: ELITE_MONTHLY_PAYOUT_CAP,
      cashout_value: 500,
    }));

    expect(result).toMatchObject({ plan: 'ELITE', cashoutValue: 500 });
  });

  it('rejects a cashout response that exceeds the remaining monthly cap', () => {
    expect(parsePayoutEvaluation(summary({
      monthly_paid: 200,
      cashout_value: 250,
    }))).toBeNull();
  });

  it('keeps the UI locked when a server response is malformed or missing', () => {
    expect(parsePayoutEvaluation(null)).toBeNull();
    expect(parsePayoutEvaluation(summary({ active_days: 5.5 }))).toBeNull();
    expect(parsePayoutEvaluation(summary({ starting_demo_balance: 104_250 }))).toBeNull();
  });

  it('preserves a violation and minimum-active-days lock supplied by the server', () => {
    const violated = parsePayoutEvaluation(summary({
      violated: true,
      violation_reason: 'Daily drawdown limit breached.',
      eligible: false,
      lock_reason: 'Account violated for this evaluation cycle.',
    }));
    const days = parsePayoutEvaluation(summary({
      active_days: 2,
      eligible: false,
      lock_reason: 'Trade on 4 more separate days to qualify.',
    }));

    expect(violated?.eligible).toBe(false);
    expect(violated?.violated).toBe(true);
    expect(days?.activeDays).toBe(2);
    expect(days?.eligible).toBe(false);
  });
});
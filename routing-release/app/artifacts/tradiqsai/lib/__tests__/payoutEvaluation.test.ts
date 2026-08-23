import { describe, expect, it } from 'vitest';
import {
  ELITE_MONTHLY_PAYOUT_CAP,
  parsePayoutEvaluation,
  parsePayoutRequests,
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

  it('subtracts reserved payouts from earned entitlement, not only the monthly cap', () => {
    // $2,000 of virtual profit on Pro earns $100. Once that $100 is reserved,
    // the remaining cap is still $150 — but the trader has no new profit to
    // request. This is the server response a rapid replay must return.
    expect(parsePayoutEvaluation(summary({
      virtual_profit: 2_000,
      monthly_paid: 100,
      cashout_value: 0,
      eligible: false,
      lock_reason: 'No eligible virtual profit is available to cash out.',
    }))).toMatchObject({ cashoutValue: 0, eligible: false });
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

describe('payout history response validation', () => {
  it('accepts a valid, server-owned payout request history', () => {
    expect(parsePayoutRequests([{
      id: 42,
      cycle_start: '2026-08-01',
      amount: 100,
      status: 'REQUESTED',
      created_at: '2026-08-12T12:30:00.000Z',
    }])).toEqual([{
      id: 42,
      cycleStart: '2026-08-01',
      amount: 100,
      status: 'REQUESTED',
      createdAt: '2026-08-12T12:30:00.000Z',
    }]);
  });

  it('fails closed when any history row is malformed or has an unknown status', () => {
    expect(parsePayoutRequests([{
      id: 1,
      cycle_start: '2026-08-01',
      amount: 100,
      status: 'FORGED',
      created_at: '2026-08-12T12:30:00.000Z',
    }])).toBeNull();
    expect(parsePayoutRequests([{
      id: 1,
      cycle_start: 'not-a-date',
      amount: 100,
      status: 'PAID',
      created_at: '2026-08-12T12:30:00.000Z',
    }])).toBeNull();
  });
});
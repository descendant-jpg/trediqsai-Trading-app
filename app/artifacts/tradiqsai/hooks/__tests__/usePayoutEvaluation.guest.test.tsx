// @vitest-environment jsdom
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  session: {
    user: { id: 'account-user', is_anonymous: false },
  } as any,
}));
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ session: authState.session }),
}));
vi.mock('@/utils/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc, from },
}));

import { usePayoutEvaluation } from '../usePayoutEvaluation';

const validEvaluation = {
  plan: 'PRO',
  starting_demo_balance: 10000,
  virtual_profit: 1000,
  profit_split: 0.05,
  monthly_cap: 250,
  monthly_paid: 0,
  cashout_value: 50,
  daily_loss: 0,
  total_equity: 11000,
  active_days: 6,
  violated: false,
  violation_reason: null,
  eligible: true,
  lock_reason: null,
};

function HookProbe({ onValue }: { onValue: (value: ReturnType<typeof usePayoutEvaluation>) => void }) {
  onValue(usePayoutEvaluation());
  return null;
}

describe('usePayoutEvaluation guest isolation', () => {
  let latest: ReturnType<typeof usePayoutEvaluation>;

  beforeEach(() => {
    authState.session = { user: { id: 'account-user', is_anonymous: false } };
    rpc.mockReset();
    from.mockReset();
    rpc.mockResolvedValue({ data: validEvaluation, error: null });
    from.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    });
  });

  afterEach(() => vi.clearAllTimers());

  it('makes zero payout requests and exposes only an empty locked state for guests', async () => {
    authState.session = { user: { id: 'guest-user', is_anonymous: true } };
    render(<HookProbe onValue={(value) => { latest = value; }} />);

    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.evaluation).toBeNull();
    expect(latest.history).toBeNull();
    expect(latest.error).toContain('Create an account');
    expect(latest.historyError).toContain('Create an account');
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    await expect(latest.requestPayout()).rejects.toThrow('Create an account');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('purges in-memory evaluation data when an account becomes a guest session', async () => {
    const view = render(<HookProbe onValue={(value) => { latest = value; }} />);
    await waitFor(() => expect(latest.evaluation?.cashoutValue).toBe(50));

    authState.session = { user: { id: 'guest-user', is_anonymous: true } };
    view.rerender(<HookProbe onValue={(value) => { latest = value; }} />);

    await waitFor(() => {
      expect(latest.evaluation).toBeNull();
      expect(latest.history).toBeNull();
      expect(latest.error).toContain('Create an account');
    });
  });
});
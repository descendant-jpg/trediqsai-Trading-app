import { describe, expect, it } from 'vitest';
import { canAccessPayoutEvaluation } from '../payoutAccess';

describe('payout evaluation route guard', () => {
  it('allows only non-anonymous signed-in users into evaluation surfaces', () => {
    expect(canAccessPayoutEvaluation(null)).toBe(false);
    expect(canAccessPayoutEvaluation({ user: { id: 'guest', is_anonymous: true } } as any)).toBe(false);
    expect(canAccessPayoutEvaluation({ user: { id: 'account', is_anonymous: false } } as any)).toBe(true);
  });
});
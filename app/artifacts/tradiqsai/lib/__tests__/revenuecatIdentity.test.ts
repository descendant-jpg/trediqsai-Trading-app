import { describe, expect, it } from 'vitest';
import { isRevenueCatIdentityReady, revenueCatIdentityKey } from '../revenuecatIdentity';

describe('RevenueCat identity cache boundary', () => {
  it('uses a different customer-info cache key for every signed-in account', () => {
    expect(revenueCatIdentityKey('trader-a')).not.toBe(revenueCatIdentityKey('trader-b'));
    expect(revenueCatIdentityKey(null)).toBe('anonymous');
  });

  it('does not treat a previous account identity as ready after account switching', () => {
    // Simulates a failed Purchases.logIn for trader-b after trader-a was active.
    expect(isRevenueCatIdentityReady('trader-a', 'trader-b')).toBe(false);
    expect(isRevenueCatIdentityReady(undefined, 'trader-b')).toBe(false);
    expect(isRevenueCatIdentityReady('trader-b', 'trader-b')).toBe(true);
  });
});
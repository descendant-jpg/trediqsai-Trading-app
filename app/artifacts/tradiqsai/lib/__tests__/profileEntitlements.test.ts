import { describe, expect, it } from 'vitest';
import { getProfileAccessTier, hasProfileProAccess, isProfileAdmin } from '../profileEntitlements';

describe('profile entitlements', () => {
  it('grants admin accounts Pro access', () => {
    expect(hasProfileProAccess({ role: 'admin', tier: 'free' })).toBe(true);
    expect(isProfileAdmin({ role: ' ADMIN ' })).toBe(true);
  });

  it('recognizes all paid and staff override tiers', () => {
    expect(hasProfileProAccess({ tier: 'pro' })).toBe(true);
    expect(hasProfileProAccess({ manual_tier_override: 'elite' })).toBe(true);
    expect(hasProfileProAccess({ tier: 'vip' })).toBe(true);
  });

  it('keeps unentitled accounts locked', () => {
    expect(hasProfileProAccess({ role: 'user', tier: 'free' })).toBe(false);
    expect(hasProfileProAccess(null)).toBe(false);
  });

  it('honors an active trial and expires it when its timestamp passes', () => {
    expect(getProfileAccessTier({ free_trial_until: '2099-01-01T00:00:00.000Z' })).toBe('pro');
    expect(getProfileAccessTier({ free_trial_until: '2000-01-01T00:00:00.000Z' })).toBe('starter');
  });

  it('lets a staff override revoke an older paid tier', () => {
    expect(getProfileAccessTier({ tier: 'elite', manual_tier_override: 'free' })).toBe('starter');
    expect(hasProfileProAccess({ tier: 'pro', manual_tier_override: 'starter' })).toBe(false);
  });

  it('combines Stripe and RevenueCat tiers without letting either revoke the other', () => {
    expect(getProfileAccessTier({ tier: 'elite', revenuecat_tier: 'starter' })).toBe('elite');
    expect(getProfileAccessTier({ tier: 'starter', revenuecat_tier: 'pro' })).toBe('pro');
  });
});
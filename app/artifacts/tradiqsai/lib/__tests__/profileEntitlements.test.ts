import { describe, expect, it } from 'vitest';
import { hasProfileProAccess, isProfileAdmin } from '../profileEntitlements';

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
});
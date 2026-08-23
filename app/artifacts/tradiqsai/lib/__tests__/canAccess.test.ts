import { describe, expect, it } from 'vitest';
import { canAccess } from '../profileEntitlements';

describe('canAccess', () => {
  it('denies anonymous users', () => {
    expect(canAccess(null)).toBe(false);
    expect(canAccess(undefined, 'free')).toBe(false);
  });

  it('grants the admin master bypass only for server-owned roles', () => {
    expect(canAccess({ role: 'admin' }, 'elite')).toBe(true);
    expect(canAccess({ role: 'god_admin' }, 'elite')).toBe(true);
    expect(canAccess({ role: 'ADMIN' }, 'pro')).toBe(true);
  });

  it('never treats client-supplied flags or emails as entitlements', () => {
    expect(canAccess({ isAdmin: true, tier: 'free' }, 'pro')).toBe(false);
    expect(canAccess({ isAdmin: true, role: 'user' }, 'elite')).toBe(false);
    expect(canAccess({ email: 'admin@example.com', tier: 'free' })).toBe(false);
    expect(canAccess({ email: 'user-admin@gmail.com' }, 'elite')).toBe(false);
  });

  it('allows free features for any signed-in user', () => {
    expect(canAccess({ tier: 'free' }, 'free')).toBe(true);
    expect(canAccess({}, 'free')).toBe(true);
  });

  it('requires pro or elite for pro features', () => {
    expect(canAccess({ tier: 'free' })).toBe(false);
    expect(canAccess({ tier: 'starter' })).toBe(false);
    expect(canAccess({ tier: 'pro' })).toBe(true);
    expect(canAccess({ tier: 'PRO' }, 'pro')).toBe(true);
    expect(canAccess({ tier: 'elite' }, 'pro')).toBe(true);
  });

  it('reserves elite features for elite', () => {
    expect(canAccess({ tier: 'free' }, 'elite')).toBe(false);
    expect(canAccess({ tier: 'pro' }, 'elite')).toBe(false);
    expect(canAccess({ tier: 'elite' }, 'elite')).toBe(true);
    expect(canAccess({ tier: 'whale' }, 'elite')).toBe(true);
  });

  it('honors manual overrides and active trials through the resolver', () => {
    expect(canAccess({ tier: 'free', manual_tier_override: 'pro' })).toBe(true);
    expect(canAccess({ tier: 'elite', manual_tier_override: 'free' }, 'elite')).toBe(false);
    expect(
      canAccess({ free_trial_until: new Date(Date.now() + 86_400_000).toISOString() }),
    ).toBe(true);
    expect(
      canAccess({ free_trial_until: new Date(Date.now() - 86_400_000).toISOString() }),
    ).toBe(false);
  });

  it('honors the RevenueCat mirror tier', () => {
    expect(canAccess({ tier: 'free', revenuecat_tier: 'elite' }, 'elite')).toBe(true);
    expect(canAccess({ tier: 'free', revenuecat_tier: 'pro' }, 'pro')).toBe(true);
  });
});

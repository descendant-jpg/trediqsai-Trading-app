import { describe, expect, it } from 'vitest';
import { canAccessMobileAdmin, normalizeProfileRole } from '../adminAccess';

describe('mobile admin role gating', () => {
  it('authorizes only the exact normalized god_admin role', () => {
    expect(canAccessMobileAdmin('god_admin')).toBe(true);
    expect(canAccessMobileAdmin(' GOD_ADMIN ')).toBe(true);
  });

  it.each(['admin', 'god-admin', 'elite', 'vip', '', null, undefined])(
    'keeps tab and protected routes closed for %s',
    (role) => {
      expect(canAccessMobileAdmin(role)).toBe(false);
    },
  );

  it('normalizes role input without inventing a fallback role', () => {
    expect(normalizeProfileRole(' God_Admin ')).toBe('god_admin');
    expect(normalizeProfileRole({ role: 'god_admin' })).toBeNull();
  });
});
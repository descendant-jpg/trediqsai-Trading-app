import { describe, expect, it } from 'vitest';
import {
  isCurrentSubscriptionIdentity,
  readCurrentSubscriptionValue,
} from '../subscriptionIdentity';

describe('subscription identity isolation', () => {
  it('rejects a delayed response captured for a previous account', () => {
    const capturedUserId = 'user-a';
    let currentUserId = capturedUserId;
    expect(isCurrentSubscriptionIdentity(capturedUserId, currentUserId)).toBe(true);

    currentUserId = 'user-b';
    expect(isCurrentSubscriptionIdentity(capturedUserId, currentUserId)).toBe(false);
  });

  it('never exposes another account cached entitlement during a switch', () => {
    const userACache = { userId: 'user-a', value: 'elite' as const };

    expect(readCurrentSubscriptionValue(userACache, 'user-a')).toBe('elite');
    expect(readCurrentSubscriptionValue(userACache, 'user-b')).toBeNull();
  });
});
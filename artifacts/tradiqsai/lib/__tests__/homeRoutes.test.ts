import { describe, expect, it } from 'vitest';
import { isResolvableRoute } from '../pendingRoute';

describe('Home dashboard route contract', () => {
  it.each([
    '/tradiqsai',
    '/session-intelligence',
    '/economic-calendar',
    '/vip-signals',
    '/shop',
    '/community',
    '/trading-arcade',
    '/quotes',
    '/notifications',
    '/trade-journal',
  ])('restores %s after sign-in', (route) => {
    expect(isResolvableRoute(route)).toBe(true);
  });
});
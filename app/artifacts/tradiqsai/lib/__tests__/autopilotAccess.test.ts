import { describe, expect, it } from 'vitest';
import {
  canAccessAutoPilot,
  shouldDismissAutoPilotPremiumSheet,
} from '../autopilotAccess';

describe('AutoPilot access', () => {
  it('fails closed for Starter and unresolved subscriptions', () => {
    expect(canAccessAutoPilot('starter')).toBe(false);
    expect(canAccessAutoPilot(undefined)).toBe(false);
  });

  it('allows Pro, Elite, and authorized administrators', () => {
    expect(canAccessAutoPilot('pro')).toBe(true);
    expect(canAccessAutoPilot('elite')).toBe(true);
    expect(canAccessAutoPilot('starter', true)).toBe(true);
  });

  it('only dismisses the Premium sheet for a meaningful downward swipe', () => {
    expect(shouldDismissAutoPilotPremiumSheet(30, 0.1)).toBe(false);
    expect(shouldDismissAutoPilotPremiumSheet(97, 0.1)).toBe(true);
    expect(shouldDismissAutoPilotPremiumSheet(45, 0.7)).toBe(true);
  });
});
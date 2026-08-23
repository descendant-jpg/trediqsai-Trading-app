import type { AccessTier } from '@/lib/profileEntitlements';

/**
 * AutoPilot is a paid feature. Unknown entitlement state deliberately fails
 * closed so an initializing subscription cannot display or enable execution.
 */
export function canAccessAutoPilot(
  accessTier: AccessTier | null | undefined,
  isAdmin = false,
): boolean {
  return isAdmin || accessTier === 'pro' || accessTier === 'elite';
}

export function shouldDismissAutoPilotPremiumSheet(
  verticalDistance: number,
  verticalVelocity: number,
): boolean {
  return verticalDistance > 96 || (verticalDistance > 44 && verticalVelocity > 0.65);
}
import type { AccessTier } from '@/lib/profileEntitlements';

export type RequiredToolTier = AccessTier;

const LEVEL: Record<RequiredToolTier, number> = {
  starter: 1,
  pro: 2,
  elite: 3,
};

/** Shared client-side display gate for the AI Tools hub. Server actions still re-check access. */
export function canAccessTool(
  requiredTier: RequiredToolTier,
  accessTier: AccessTier,
  isAdmin: boolean,
): boolean {
  return isAdmin || LEVEL[accessTier] >= LEVEL[requiredTier];
}
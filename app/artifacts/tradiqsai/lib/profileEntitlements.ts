export type ProfileEntitlement = {
  role?: string | null;
  tier?: string | null;
  revenuecat_tier?: string | null;
  manual_tier_override?: string | null;
  free_trial_until?: string | null;
};

const PRO_TIERS = new Set(['pro', 'elite', 'whale', 'vip']);
const ADMIN_ROLES = new Set(['admin', 'god_admin']);
export type AccessTier = 'starter' | 'pro' | 'elite';

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/** Client-side display gate for an already server-owned profile entitlement. */
export function hasProfileProAccess(profile: ProfileEntitlement | null | undefined): boolean {
  return getProfileAccessTier(profile) !== 'starter' || normalized(profile?.role) === 'admin';
}

export function isProfileAdmin(profile: ProfileEntitlement | null | undefined): boolean {
  return ADMIN_ROLES.has(normalized(profile?.role));
}

export type UserProfile = ProfileEntitlement & {
  /** Accepted for call-site convenience but NEVER an entitlement signal:
   *  email is a user-chosen identifier, not server-owned authorization. */
  email?: string | null;
  isAdmin?: boolean | null;
};

export type RequiredTier = 'free' | 'pro' | 'elite';

/**
 * Unified client-side access engine ("God Mode" rule):
 * 1. Admin Master Bypass — server-owned role or explicit admin flag unlocks
 *    every tier.
 * 2. Tier Hierarchy — free < pro < elite, resolved through the profile
 *    entitlement resolver (manual overrides, trials, billing tier) so every
 *    screen evaluates the same effective tier. Unresolved tiers fail closed.
 *
 * Display gate only: server actions still re-check access.
 */
export function canAccess(
  user: UserProfile | null | undefined,
  requiredTier: RequiredTier = 'pro',
): boolean {
  if (!user) return false;

  // 1. Admin Master Bypass (server-owned signals only — email is user-chosen
  // and must never unlock paid tiers)
  if (isProfileAdmin(user) || user.isAdmin === true) {
    return true;
  }

  // 2. Tier Hierarchy Evaluation
  if (requiredTier === 'free') return true;
  const userTier = getProfileAccessTier(user);
  if (requiredTier === 'pro') return userTier === 'pro' || userTier === 'elite';
  return userTier === 'elite';
}

/** Normalizes server-owned profile data into the tier used for client display gates. */
export function getProfileAccessTier(
  profile: ProfileEntitlement | null | undefined,
): AccessTier {
  return getProfileTier(profile, true);
}

/**
 * Resolves access granted directly by the application profile, excluding the
 * RevenueCat mirror. Use this for sensitive external-link gates so a delayed
 * webhook cannot keep a cancelled store subscription active.
 */
export function getProfileGrantedAccessTier(
  profile: ProfileEntitlement | null | undefined,
): AccessTier {
  return getProfileTier(profile, false);
}

function getProfileTier(
  profile: ProfileEntitlement | null | undefined,
  includeRevenueCatTier: boolean,
): AccessTier {
  const trialUntil = profile?.free_trial_until ? Date.parse(profile.free_trial_until) : NaN;
  if (!Number.isNaN(trialUntil) && trialUntil > Date.now()) return 'pro';
  // A non-empty manual override wins, including a staff downgrade to free.
  const override = normalized(profile?.manual_tier_override);
  const billingTier = normalized(profile?.tier);
  const revenueCatTier = includeRevenueCatTier
    ? normalized(profile?.revenuecat_tier)
    : '';
  const effectiveTier = override || highestPaidTier(billingTier, revenueCatTier);
  if (effectiveTier === 'elite' || effectiveTier === 'whale' || effectiveTier === 'vip') return 'elite';
  return PRO_TIERS.has(effectiveTier) ? 'pro' : 'starter';
}

function highestPaidTier(primary: string, secondary: string): string {
  const rank = (tier: string) =>
    tier === 'elite' || tier === 'whale' || tier === 'vip' ? 2 : PRO_TIERS.has(tier) ? 1 : 0;
  return rank(secondary) > rank(primary) ? secondary : primary;
}
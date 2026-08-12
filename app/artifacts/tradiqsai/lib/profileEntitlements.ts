export type ProfileEntitlement = {
  role?: string | null;
  tier?: string | null;
  manual_tier_override?: string | null;
  free_trial_until?: string | null;
};

const PRO_TIERS = new Set(['pro', 'elite', 'whale', 'vip']);
export type AccessTier = 'starter' | 'pro' | 'elite';

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/** Client-side display gate for an already server-owned profile entitlement. */
export function hasProfileProAccess(profile: ProfileEntitlement | null | undefined): boolean {
  return getProfileAccessTier(profile) !== 'starter' || normalized(profile?.role) === 'admin';
}

export function isProfileAdmin(profile: ProfileEntitlement | null | undefined): boolean {
  return normalized(profile?.role) === 'admin';
}

/** Normalizes server-owned profile data into the tier used for client display gates. */
export function getProfileAccessTier(
  profile: ProfileEntitlement | null | undefined,
): AccessTier {
  const trialUntil = profile?.free_trial_until ? Date.parse(profile.free_trial_until) : NaN;
  if (!Number.isNaN(trialUntil) && trialUntil > Date.now()) return 'pro';
  // A non-empty manual override wins, including a staff downgrade to free.
  const override = normalized(profile?.manual_tier_override);
  const effectiveTier = override || normalized(profile?.tier);
  if (effectiveTier === 'elite' || effectiveTier === 'whale' || effectiveTier === 'vip') return 'elite';
  return PRO_TIERS.has(effectiveTier) ? 'pro' : 'starter';
}
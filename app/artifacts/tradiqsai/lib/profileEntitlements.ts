export type ProfileEntitlement = {
  role?: string | null;
  tier?: string | null;
  manual_tier_override?: string | null;
};

const PRO_TIERS = new Set(['pro', 'elite', 'whale', 'vip']);

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/** Client-side display gate for an already server-owned profile entitlement. */
export function hasProfileProAccess(profile: ProfileEntitlement | null | undefined): boolean {
  return normalized(profile?.role) === 'admin'
    || PRO_TIERS.has(normalized(profile?.manual_tier_override))
    || PRO_TIERS.has(normalized(profile?.tier));
}

export function isProfileAdmin(profile: ProfileEntitlement | null | undefined): boolean {
  return normalized(profile?.role) === 'admin';
}
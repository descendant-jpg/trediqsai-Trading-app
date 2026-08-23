import { logger } from "./logger";

/**
 * Resolves a user id into their subscription tier, or null when the tier
 * cannot be determined. Injectable so tests don't need a live Supabase.
 */
export type TierLookup = (userId: string) => Promise<string | null>;

/** Identity used for requests that carry no Authorization header. */
const ANONYMOUS = "anonymous";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
/**
 * The service role key is required: tier is a server-owned column that the
 * anon key must not be able to read around. Never expose this to clients.
 */
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export const isEntitlementConfigured = !!SUPABASE_URL && !!SERVICE_ROLE_KEY;

/**
 * Tier values that grant access to Pro-only features. Compared
 * case-insensitively because the column is free-form text.
 */
const PRO_TIERS = new Set(["pro", "elite", "whale", "vip"]);
const ELITE_TIERS = new Set(["elite", "whale", "vip"]);
const ELITE_STAFF_ROLES = new Set(["admin", "god_admin"]);

/**
 * Default lookup: reads the caller's tier straight from Supabase with the
 * service role key, so the value cannot be influenced by the client.
 *
 * Deliberately NOT cached. A cached "pro" answer keeps authorizing a user
 * whose subscription just ended, and there is no reliable way to invalidate
 * a per-process cache from the billing webhook or admin tooling that performs
 * the downgrade — those run in a different process (and, in production,
 * different instances). A revocation guarantee is worth one lookup per
 * request; if this ever becomes a bottleneck, the fix is a shared cache that
 * the downgrade path can invalidate, not a local TTL.
 */
const supabaseTierLookup: TierLookup = async (userId) => {
  const params = new URLSearchParams({
    id: `eq.${userId}`,
    select: "role,tier,revenuecat_tier,manual_tier_override,free_trial_until",
    limit: "1",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${params}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Tier lookup failed with status ${res.status}`);

  const rows = (await res.json()) as {
    role?: string | null;
    tier?: string | null;
    revenuecat_tier?: string | null;
    manual_tier_override?: string | null;
    free_trial_until?: string | null;
  }[];
  const row = rows[0];
  if (!row) return null;
  if (ELITE_STAFF_ROLES.has(row.role?.trim().toLowerCase() ?? "")) {
    return "elite";
  }

  // An unexpired free trial grants Pro access regardless of the stored tier.
  const trialUntil = row.free_trial_until
    ? Date.parse(row.free_trial_until)
    : NaN;
  if (!Number.isNaN(trialUntil) && trialUntil > Date.now()) {
    return "pro";
  }
  // A manual override (set by staff) wins over the billing-derived tier.
  if (row.manual_tier_override) return row.manual_tier_override;
  return highestPaidTier(row.tier, row.revenuecat_tier);
};

function highestPaidTier(
  first: string | null | undefined,
  second: string | null | undefined,
): string | null {
  const normalize = (tier: string | null | undefined) => tier?.trim().toLowerCase() ?? '';
  const tierRank = (tier: string) => ELITE_TIERS.has(tier) ? 2 : PRO_TIERS.has(tier) ? 1 : 0;
  const primary = normalize(first);
  const secondary = normalize(second);
  return tierRank(secondary) > tierRank(primary) ? (second ?? null) : (first ?? second ?? null);
}

/** True when the tier string grants Pro-only access. */
export function isProTier(tier: string | null | undefined): boolean {
  return !!tier && PRO_TIERS.has(tier.trim().toLowerCase());
}

/** True when the tier string grants Elite-only access. */
export function isEliteTier(tier: string | null | undefined): boolean {
  return !!tier && ELITE_TIERS.has(tier.trim().toLowerCase());
}

async function hasTierAccess(
  userId: string,
  lookup: TierLookup | undefined,
  permits: (tier: string | null | undefined) => boolean,
  featureName: string,
): Promise<boolean> {
  if (!userId || userId === ANONYMOUS) return false;

  const resolve = lookup ?? supabaseTierLookup;
  if (!lookup && !isEntitlementConfigured) {
    logger.error(
      { userId },
      `${featureName} access denied: Supabase service role credentials are not configured`,
    );
    return false;
  }

  try {
    return permits(await resolve(userId));
  } catch (err) {
    logger.error({ err, userId }, `${featureName} access denied: tier lookup failed`);
    return false;
  }
}

/**
 * Whether the caller may use Pro-only features.
 *
 * Fails closed on purpose: anonymous callers, unconfigured servers, and
 * failed lookups all resolve to `false`. A paid feature must never open up
 * because a check errored -- that is exactly the bypass this guards.
 */
export async function hasProAccess(
  userId: string,
  lookup?: TierLookup,
): Promise<boolean> {
  return hasTierAccess(userId, lookup, isProTier, "Pro");
}

/** Whether the caller may use Elite-only features. Fails closed on errors. */
export async function hasEliteAccess(
  userId: string,
  lookup?: TierLookup,
): Promise<boolean> {
  return hasTierAccess(userId, lookup, isEliteTier, "Elite");
}

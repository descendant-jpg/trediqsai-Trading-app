/**
 * Server-side Supabase helper using the service role key.
 * The service role key bypasses RLS — use only for trusted server operations.
 */

const SUPABASE_URL =
  process.env['SUPABASE_URL'] ?? process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/**
 * Applies a verified Stripe PaymentIntent through the database-owned,
 * service-role-only idempotency boundary.
 */
export async function grantEliteTier(
  userId: string,
  paymentIntentId: string,
  eventAt: Date,
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role credentials are not configured on the server.');
  }

  if (
    !paymentIntentId.startsWith('pi_') ||
    Number.isNaN(eventAt.getTime())
  ) {
    throw new Error('Invalid verified Stripe entitlement event.');
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/handle_subscription_update`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_tier: 'elite',
          p_provider: 'stripe',
          p_event_id: paymentIntentId,
          p_event_at: eventAt.toISOString(),
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Supabase subscription update failed (${res.status}).`);
    }
    return (await res.json()) as boolean;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Could not grant Elite tier: ${error.message}`);
    }
    throw new Error('Could not grant Elite tier due to an unknown Supabase error.');
  }
}

/** Billing tiers that a verified payment provider may set. */
export type BillingTier = 'starter' | 'pro' | 'elite';

/**
 * Updates only the RevenueCat-derived subscription tier. The legacy `tier`
 * field is also used by Stripe and staff tooling, so it must never be
 * overwritten by a RevenueCat webhook.
 */
export async function setBillingTier(userId: string, tier: BillingTier): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role credentials are not configured on the server.');
  }

  if (!['starter', 'pro', 'elite'].includes(tier)) {
    throw new Error('Invalid billing tier configuration.');
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ revenuecat_tier: tier }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase RevenueCat tier update failed (${res.status}): ${text}`);
  }
}

/**
 * Applies a verified RevenueCat event through a database-side monotonic guard.
 * Store webhooks are retried and can arrive out of order, so a direct PATCH
 * would let an old purchase overwrite a newer expiration.
 */
export async function applyRevenueCatTier(
  userId: string,
  tier: BillingTier,
  eventAt: Date,
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role credentials are not configured on the server.');
  }
  if (!['starter', 'pro', 'elite'].includes(tier) || Number.isNaN(eventAt.getTime())) {
    throw new Error('Invalid verified RevenueCat entitlement event.');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_revenuecat_entitlement`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_tier: tier,
      p_event_at: eventAt.toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase RevenueCat event application failed (${res.status}): ${text}`);
  }
  return (await res.json()) as boolean;
}

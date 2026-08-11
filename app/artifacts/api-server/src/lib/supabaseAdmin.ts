/**
 * Server-side Supabase helper using the service role key.
 * The service role key bypasses RLS — use only for trusted server operations.
 */

const SUPABASE_URL =
  process.env['SUPABASE_URL'] ?? process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/**
 * Writes subscription_tier = 'pro' to the profiles table for the given user.
 * Uses the service role key so it is never callable from the client.
 * Safe to call multiple times — a repeated PATCH is idempotent.
 */
export async function grantEliteTier(userId: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role credentials are not configured on the server.');
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
      body: JSON.stringify({ subscription_tier: 'pro' }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase profile update failed (${res.status}): ${text}`);
  }
}

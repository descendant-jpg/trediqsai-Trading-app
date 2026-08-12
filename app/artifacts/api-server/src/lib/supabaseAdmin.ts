/**
 * Server-side Supabase helper using the service role key.
 * The service role key bypasses RLS — use only for trusted server operations.
 */

const SUPABASE_URL =
  process.env['SUPABASE_URL'] ?? process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/**
 * Writes the canonical paid tier to the profiles table for the given user.
 * Uses the service role key so it is never callable from the client.
 * Safe to call multiple times — a repeated PATCH is idempotent and leaves
 * every non-entitlement field (including role) unchanged.
 */
export async function grantEliteTier(userId: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role credentials are not configured on the server.');
  }

  const tier = 'elite'.toLowerCase();
  if (tier !== 'elite') {
    throw new Error('Invalid paid tier configuration.');
  }

  try {
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
        // Do not include role or staff overrides here. Payment fulfillment
        // must never alter an administrator's authority.
        body: JSON.stringify({ tier }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase profile update failed (${res.status}): ${text}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Could not grant Elite tier: ${error.message}`);
    }
    throw new Error('Could not grant Elite tier due to an unknown Supabase error.');
  }
}

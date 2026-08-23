import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service role key.
 * Never import this in client components — the service role key must stay server-side.
 */
export function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

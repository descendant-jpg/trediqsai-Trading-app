import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';

/**
 * POST /api/admin/users/tier
 *
 * Change a user's paid tier.
 *
 * This exists because `profiles.tier` is server-owned: clients hold no UPDATE
 * privilege on it, so the admin UI cannot write it directly with the anon key
 * (and must not be able to — that privilege is exactly the paywall bypass).
 * The write happens here with the service role, behind the admin session
 * cookie that `middleware.ts` enforces for every `/api/admin/*` route.
 */

/** Tiers an operator may assign. Anything else is rejected. */
const ALLOWED_TIERS = new Set(['free', 'pro', 'elite', 'whale', 'vip']);

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { userId, tier } = (body ?? {}) as { userId?: unknown; tier?: unknown };

  if (typeof userId !== 'string' || userId.trim() === '') {
    return NextResponse.json({ error: 'A userId is required.' }, { status: 400 });
  }
  if (typeof tier !== 'string' || !ALLOWED_TIERS.has(tier)) {
    return NextResponse.json(
      { error: `tier must be one of: ${[...ALLOWED_TIERS].join(', ')}.` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on this server.' },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ tier })
    .eq('id', userId)
    .select('id, tier')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'No such user.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data.id, tier: data.tier });
}

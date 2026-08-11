import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../lib/supabase-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = (body?.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 422 },
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    // Supabase not configured — log server-side and fail gracefully
    console.warn('[waitlist] Supabase service role key is not configured.');
    return NextResponse.json(
      { error: 'Waitlist is temporarily unavailable. Please try again later.' },
      { status: 503 },
    );
  }

  const { error } = await supabase
    .from('waitlist')
    .insert({ email });

  if (error) {
    // Postgres unique-violation code
    if (error.code === '23505') {
      return NextResponse.json(
        { error: "You're already on the list — we'll be in touch!" },
        { status: 409 },
      );
    }
    console.error('[waitlist] insert error:', error.message);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

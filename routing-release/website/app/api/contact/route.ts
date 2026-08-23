import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../lib/supabase-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const message = String(body?.message ?? '').trim();

    if (!name || !email || !message || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Please provide your name, a valid email address, and a message.' },
        { status: 422 },
      );
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      console.warn('[contact] Supabase service role key is not configured.');
      return NextResponse.json(
        { error: 'Contact service is not configured yet. Please try again shortly.' },
        { status: 503 },
      );
    }

    const { error } = await supabase
      .from('contact_messages')
      .insert({ name, email, message });

    if (error) {
      console.error('[contact] insert error:', error.message);
      return NextResponse.json(
        { error: 'Unable to send your message right now. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, message: 'Message received. Our team will be in touch.' });
  } catch (error) {
    console.error('[contact] request error:', error);
    return NextResponse.json(
      { error: 'Unable to send your message right now. Please try again.' },
      { status: 400 },
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../lib/supabase-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// In-memory rate limiter — 5 requests per IP per hour
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 5;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/** Returns true when the request is within the allowed rate, false when limited. */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // First request in this window
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

/** Best-effort IP extraction that works in Next.js behind a proxy. */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Rate-limit check
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

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

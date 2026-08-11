import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isAdminAuthConfigured,
  verifyAdminPassword,
} from '../../../../lib/admin-auth';
import {
  clearLoginAttempts,
  getClientIp,
  isLoginBlocked,
  recordFailedLogin,
} from '../../../../lib/admin-rate-limit';

/** This route touches the database, so it must not be statically optimised. */
export const dynamic = 'force-dynamic';

const TOO_MANY_ATTEMPTS = 'Too many attempts. Please try again later.';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Attempts are counted in Postgres, so a lockout survives a restart or
  // redeploy and applies across every running instance.
  if (await isLoginBlocked(ip)) {
    return NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 });
  }

  if (!isAdminAuthConfigured()) {
    console.warn('[admin-auth] ADMIN_PASSWORD or SESSION_SECRET is not configured.');
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 },
    );
  }

  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!verifyAdminPassword(password)) {
    // Only wrong passwords count against the limit.
    const nowBlocked = await recordFailedLogin(ip);
    return nowBlocked
      ? NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 })
      : NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 },
    );
  }

  // A correct password wipes the slate, so an admin who mistyped a few times
  // is not left one attempt away from a lockout.
  await clearLoginAttempts(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

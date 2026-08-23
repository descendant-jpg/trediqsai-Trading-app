import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  cookieMaxAgeSeconds,
  refreshSessionToken,
} from '../../../../lib/admin-auth';

/**
 * POST /api/admin/refresh
 *
 * Slides (extends) the current admin session by issuing a fresh token. The
 * caller must already hold a valid session — the middleware enforces this
 * before the handler runs. No password is required.
 *
 * Extensions are bounded: the token keeps its original sign-in time, and the
 * new expiry is clamped to an absolute ceiling measured from that sign-in
 * (`ADMIN_SESSION_MAX_HOURS`, 24 hours by default). Once the ceiling is
 * reached, refreshing is refused and the admin must sign in with the password
 * again — so a stolen cookie cannot be held open indefinitely.
 *
 * SESSION_SECRET rotation automatically invalidates old tokens because the
 * HMAC signature will no longer verify, so rotation still expires all
 * existing sessions as expected.
 */
export async function POST(req: NextRequest) {
  const existing = req.cookies.get(ADMIN_COOKIE)?.value;
  const result = await refreshSessionToken(existing);

  if (result.status === 'unauthenticated') {
    return NextResponse.json({ error: 'No active session.' }, { status: 401 });
  }

  if (result.status === 'not_configured') {
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 },
    );
  }

  if (result.status === 'ceiling_reached') {
    return NextResponse.json(
      {
        error:
          'This session has reached its maximum length. Please sign in again to continue.',
        expiresAt: result.session.expiresAt,
        absoluteExpiresAt: result.session.absoluteExpiresAt,
      },
      { status: 403 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    expiresAt: result.session.expiresAt,
    absoluteExpiresAt: result.session.absoluteExpiresAt,
  });
  res.cookies.set(ADMIN_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: cookieMaxAgeSeconds(result.session.expiresAt),
  });
  return res;
}

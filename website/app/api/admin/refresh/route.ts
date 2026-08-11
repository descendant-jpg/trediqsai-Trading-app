import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isValidSessionToken,
} from '../../../../lib/admin-auth';

/**
 * POST /api/admin/refresh
 *
 * Slides (extends) the current admin session by issuing a fresh token. The
 * caller must already hold a valid session — the middleware enforces this
 * before the handler runs. No password is required.
 *
 * SESSION_SECRET rotation automatically invalidates old tokens because the
 * HMAC signature will no longer verify, so rotation still expires all
 * existing sessions as expected.
 */
export async function POST(req: NextRequest) {
  // Double-check the incoming token is still valid (middleware already did
  // this, but belt-and-suspenders for direct calls).
  const existing = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!(await isValidSessionToken(existing))) {
    return NextResponse.json({ error: 'No active session.' }, { status: 401 });
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 },
    );
  }

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

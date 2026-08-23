import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, revokeAllSessions } from '../../../../lib/admin-auth';

/**
 * POST /api/admin/revoke-all
 *
 * Immediately invalidates every active admin session on every device by
 * advancing the server-side revocation timestamp. Any token whose `issuedAt`
 * predates this timestamp is rejected by the middleware on the next request.
 *
 * The calling device's cookie is also cleared so it is returned to the sign-in
 * screen along with all other devices — a clean, unambiguous outcome.
 *
 * Protected by the middleware: only a currently authenticated admin can reach
 * this endpoint.
 */
export async function POST() {
  await revokeAllSessions();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}

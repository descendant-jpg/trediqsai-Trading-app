import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, readSessionToken } from '../../../../lib/admin-auth';

/**
 * GET /api/admin/session
 *
 * Returns the current admin session's expiry along with the absolute ceiling
 * for this sign-in, so the client can warn before the session expires *and*
 * before it can no longer be extended at all. The middleware already verifies
 * the session is valid before this handler runs.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const session = await readSessionToken(token);

  if (session === null) {
    return NextResponse.json({ error: 'No active session.' }, { status: 401 });
  }

  return NextResponse.json({
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    // `false` once the ceiling has been reached — extending is refused from
    // here on and the admin must sign in with the password again.
    canExtend: session.expiresAt < session.absoluteExpiresAt,
  });
}

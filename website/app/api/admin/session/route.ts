import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, getSessionExpiry } from '../../../../lib/admin-auth';

/**
 * GET /api/admin/session
 *
 * Returns the expiry timestamp of the current admin session so the client
 * can display a warning before it expires. The middleware already verifies the
 * session is valid before this handler runs, so we only need to extract the
 * expiry from the cookie.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const expiresAt = await getSessionExpiry(token);

  if (expiresAt === null) {
    return NextResponse.json({ error: 'No active session.' }, { status: 401 });
  }

  return NextResponse.json({ expiresAt });
}

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isValidSessionToken } from './lib/admin-auth';

/**
 * Gate every admin page and every admin API route behind an authenticated
 * admin session. Fails closed: without a valid session, pages redirect to
 * sign-in and API routes return 401.
 *
 * The sign-in and sign-out endpoints are the only exceptions — they must stay
 * reachable to establish or clear a session.
 */
const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login', '/api/admin/logout']);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidSessionToken(token)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  if (pathname !== '/admin') {
    loginUrl.searchParams.set('next', `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};

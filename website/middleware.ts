import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isValidSessionToken } from './lib/admin-auth';

/**
 * Gate every /admin route behind an authenticated admin session.
 * Fails closed: without a valid session the request is redirected to sign-in.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // The sign-in screen itself must stay reachable.
  if (pathname === '/admin/login') return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidSessionToken(token)) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  if (pathname !== '/admin') {
    loginUrl.searchParams.set('next', `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};

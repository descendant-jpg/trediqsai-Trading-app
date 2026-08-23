/**
 * Contract tests for the admin gate.
 *
 * The middleware is the single thing standing between the public internet and
 * the CMS — including the waitlist, which holds real people's email addresses.
 * These tests exist so that a change which quietly opens an admin page or an
 * admin API route fails the test run instead of shipping.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { middleware } from '../middleware';
import { ADMIN_COOKIE, createSessionToken } from '../lib/admin-auth';

const ORIGIN = 'https://tradiqs.example';

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.ADMIN_PASSWORD = 'test-password';
});

afterEach(() => {
  delete process.env.ADMIN_SESSION_MAX_HOURS;
});

/** Build a request, optionally carrying a session cookie. */
function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(new URL(path, ORIGIN));
  if (cookie !== undefined) req.cookies.set(ADMIN_COOKIE, cookie);
  return req;
}

/** A cookie value for a genuine, current session. */
async function validCookie(): Promise<string> {
  const token = await createSessionToken();
  expect(token).not.toBeNull();
  return token as string;
}

/** Did the middleware let the request through to the page/route? */
function passedThrough(res: Response): boolean {
  // NextResponse.next() is signalled with this internal header.
  return res.headers.has('x-middleware-next');
}

/** Every admin surface a signed-out visitor might try. */
const ADMIN_PAGES = [
  '/admin',
  '/admin/waitlist',
  '/admin/users',
  '/admin/blog',
  '/admin/inbox',
  '/admin/signals',
];

const ADMIN_APIS = [
  '/api/admin/session',
  '/api/admin/refresh',
];

describe('admin gate — signed out', () => {
  it.each(ADMIN_PAGES)('sends a signed-out visitor from %s to sign-in', async (path) => {
    const res = await middleware(request(path));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') as string);
    expect(location.pathname).toBe('/admin/login');
    expect(passedThrough(res)).toBe(false);
  });

  it('remembers where the visitor was trying to go', async () => {
    const res = await middleware(request('/admin/waitlist?page=2'));

    const location = new URL(res.headers.get('location') as string);
    expect(location.pathname).toBe('/admin/login');
    expect(location.searchParams.get('next')).toBe('/admin/waitlist?page=2');
  });

  it.each(ADMIN_APIS)('refuses a signed-out caller at %s', async (path) => {
    const res = await middleware(request(path));

    expect(res.status).toBe(401);
    expect(passedThrough(res)).toBe(false);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized.' });
  });

  it('refuses admin API routes that do not exist yet', async () => {
    // A new admin endpoint must be protected by default, not by remembering to
    // add it to a list.
    const res = await middleware(request('/api/admin/some-future-endpoint'));
    expect(res.status).toBe(401);
  });
});

describe('admin gate — invalid credentials', () => {
  it.each([
    ['an empty cookie', ''],
    ['a garbage cookie', 'not-a-token'],
    ['a legacy two-part cookie', `${Date.now() + 3_600_000}.signature`],
  ])('does not accept %s', async (_label, cookie) => {
    const res = await middleware(request('/admin/waitlist', cookie));
    expect(res.status).toBe(307);
    expect(passedThrough(res)).toBe(false);
  });

  it('does not accept a cookie whose signature was tampered with', async () => {
    const [issuedAt, expiresAt] = (await validCookie()).split('.');
    const forged = `${issuedAt}.${expiresAt}.deadbeef`;

    const res = await middleware(request('/admin/waitlist', forged));
    expect(res.status).toBe(307);
  });

  it('does not accept a cookie signed with a different secret', async () => {
    process.env.SESSION_SECRET = 'someone-elses-secret';
    const foreign = await validCookie();
    process.env.SESSION_SECRET = 'test-secret';

    const res = await middleware(request('/admin/waitlist', foreign));
    expect(res.status).toBe(307);
  });

  it('locks everyone out again when the session secret is rotated', async () => {
    const cookie = await validCookie();
    expect(passedThrough(await middleware(request('/admin/waitlist', cookie)))).toBe(true);

    process.env.SESSION_SECRET = 'rotated-secret';

    const res = await middleware(request('/admin/waitlist', cookie));
    expect(res.status).toBe(307);
  });
});

describe('admin gate — signed in', () => {
  it.each(ADMIN_PAGES)('lets a signed-in admin reach %s', async (path) => {
    const res = await middleware(request(path, await validCookie()));
    expect(passedThrough(res)).toBe(true);
  });

  it.each(ADMIN_APIS)('lets a signed-in admin call %s', async (path) => {
    const res = await middleware(request(path, await validCookie()));
    expect(passedThrough(res)).toBe(true);
  });
});

describe('admin gate — sign-in and sign-out stay reachable', () => {
  it.each([
    '/admin/login',
    '/api/admin/login',
    '/api/admin/logout',
  ])('leaves %s open so a session can be created or cleared', async (path) => {
    const res = await middleware(request(path));
    expect(passedThrough(res)).toBe(true);
  });

  it('does not redirect the sign-in page to itself', async () => {
    // A redirect loop here would lock every admin out of the CMS entirely.
    const res = await middleware(request('/admin/login?next=/admin/waitlist'));
    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
  });
});

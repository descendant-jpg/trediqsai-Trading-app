/**
 * Contract tests for the admin sign-in endpoint.
 *
 * These check the wiring rather than the counting: that only wrong passwords
 * count against the limit, that a locked-out caller is turned away before the
 * password is even checked, and that a correct password clears the record.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limiter = vi.hoisted(() => ({
  isLoginBlocked: vi.fn(async () => false),
  recordFailedLogin: vi.fn(async () => false),
  clearLoginAttempts: vi.fn(async () => {}),
  getClientIp: vi.fn(() => '203.0.113.7'),
}));

vi.mock('../../../../../lib/admin-rate-limit', () => limiter);

import { POST } from '../route';
import { ADMIN_COOKIE } from '../../../../../lib/admin-auth';

const PASSWORD = 'correct-horse';

function signInRequest(password: unknown): NextRequest {
  return new NextRequest('https://tradiqs.example/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ password }),
  });
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.SESSION_SECRET = 'test-secret';
  limiter.isLoginBlocked.mockResolvedValue(false);
  limiter.recordFailedLogin.mockResolvedValue(false);
  limiter.clearLoginAttempts.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('admin sign-in endpoint', () => {
  it('signs the admin in with the correct password', async () => {
    const res = await POST(signInRequest(PASSWORD));

    expect(res.status).toBe(200);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeTruthy();
    // A successful sign-in must never count against the limit.
    expect(limiter.recordFailedLogin).not.toHaveBeenCalled();
  });

  it('forgets earlier mistypes once the admin gets it right', async () => {
    await POST(signInRequest(PASSWORD));
    expect(limiter.clearLoginAttempts).toHaveBeenCalledWith('203.0.113.7');
  });

  it('counts a wrong password against the limit', async () => {
    const res = await POST(signInRequest('wrong'));

    expect(res.status).toBe(401);
    expect(limiter.recordFailedLogin).toHaveBeenCalledWith('203.0.113.7');
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  });

  it('reports the lockout on the attempt that triggers it', async () => {
    limiter.recordFailedLogin.mockResolvedValue(true);

    const res = await POST(signInRequest('wrong'));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: 'Too many attempts. Please try again later.',
    });
  });

  it('turns a locked-out caller away without checking the password', async () => {
    limiter.isLoginBlocked.mockResolvedValue(true);

    // Even the correct password must not get through while locked out —
    // otherwise the limit would not slow a guessing attack at all.
    const res = await POST(signInRequest(PASSWORD));

    expect(res.status).toBe(429);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  });

  it('does not issue a session while locked out', async () => {
    limiter.isLoginBlocked.mockResolvedValue(true);
    const res = await POST(signInRequest(PASSWORD));
    expect(limiter.clearLoginAttempts).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
  });

  it('counts a missing or malformed password as a failed attempt', async () => {
    const res = await POST(signInRequest(undefined));
    expect(res.status).toBe(401);
    expect(limiter.recordFailedLogin).toHaveBeenCalled();
  });

  it('rejects a body that is not valid JSON', async () => {
    const req = new NextRequest('https://tradiqs.example/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect((await POST(req)).status).toBe(400);
  });

  it('says so when the server has no admin password configured', async () => {
    delete process.env.ADMIN_PASSWORD;

    const res = await POST(signInRequest('anything'));
    expect(res.status).toBe(503);
  });
});

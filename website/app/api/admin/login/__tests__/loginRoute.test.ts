/**
 * Contract tests for the admin sign-in endpoint.
 *
 * These check the wiring rather than the counting: that only wrong passwords
 * count against the limit, that a locked-out caller is turned away before the
 * password is even checked, and that a correct password clears both the per-IP
 * and global records.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limiter = vi.hoisted(() => ({
  isLoginBlocked: vi.fn(async () => false),
  isGlobalLoginBlocked: vi.fn(async () => false),
  recordFailedLogin: vi.fn(async () => false),
  recordGlobalFailedLogin: vi.fn(async () => false),
  clearLoginAttempts: vi.fn(async () => {}),
  clearGlobalLoginAttempts: vi.fn(async () => {}),
  getClientIp: vi.fn(() => '203.0.113.7'),
}));

vi.mock('../../../../../lib/admin-rate-limit', () => limiter);

import { POST } from '../route';
import { ADMIN_COOKIE } from '../../../../../lib/admin-auth';

const PASSWORD = 'correct-horse';

function signInRequest(password: unknown, email = 'nextgensynthex@gmail.com'): NextRequest {
  return new NextRequest('https://tradiqs.example/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ email, password }),
  });
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.SESSION_SECRET = 'test-secret';
  limiter.isLoginBlocked.mockResolvedValue(false);
  limiter.isGlobalLoginBlocked.mockResolvedValue(false);
  limiter.recordFailedLogin.mockResolvedValue(false);
  limiter.recordGlobalFailedLogin.mockResolvedValue(false);
  limiter.clearLoginAttempts.mockClear();
  limiter.clearGlobalLoginAttempts.mockClear();
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
    expect(limiter.recordGlobalFailedLogin).not.toHaveBeenCalled();
  });

  it('forgets per-IP and global mistypes once the admin gets it right', async () => {
    await POST(signInRequest(PASSWORD));
    expect(limiter.clearLoginAttempts).toHaveBeenCalledWith('203.0.113.7');
    expect(limiter.clearGlobalLoginAttempts).toHaveBeenCalled();
  });

  it('counts a wrong password against both the per-IP and global limits', async () => {
    const res = await POST(signInRequest('wrong'));

    expect(res.status).toBe(401);
    expect(limiter.recordFailedLogin).toHaveBeenCalledWith('203.0.113.7');
    expect(limiter.recordGlobalFailedLogin).toHaveBeenCalled();
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  });

  it('rejects a correct password from an unauthorized email', async () => {
    const res = await POST(signInRequest(PASSWORD, 'other@example.com'));
    expect(res.status).toBe(401);
    expect(limiter.recordFailedLogin).toHaveBeenCalledWith('203.0.113.7');
  });

  it('reports the per-IP lockout on the attempt that triggers it', async () => {
    limiter.recordFailedLogin.mockResolvedValue(true);
    limiter.recordGlobalFailedLogin.mockResolvedValue(false);

    const res = await POST(signInRequest('wrong'));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: 'Too many attempts. Please try again later.',
    });
  });

  it('reports the global lockout on the attempt that triggers it', async () => {
    limiter.recordFailedLogin.mockResolvedValue(false);
    limiter.recordGlobalFailedLogin.mockResolvedValue(true);

    const res = await POST(signInRequest('wrong'));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: 'Too many failed sign-in attempts from multiple locations. Please try again later.',
    });
  });

  it('prefers the global lockout message when both limits trip at once', async () => {
    limiter.recordFailedLogin.mockResolvedValue(true);
    limiter.recordGlobalFailedLogin.mockResolvedValue(true);

    const res = await POST(signInRequest('wrong'));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/multiple locations/);
  });

  it('turns a per-IP locked-out caller away without checking the password', async () => {
    limiter.isLoginBlocked.mockResolvedValue(true);

    // Even the correct password must not get through while locked out —
    // otherwise the limit would not slow a guessing attack at all.
    const res = await POST(signInRequest(PASSWORD));

    expect(res.status).toBe(429);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  });

  it('turns a globally locked-out caller away without checking the password', async () => {
    limiter.isLoginBlocked.mockResolvedValue(false);
    limiter.isGlobalLoginBlocked.mockResolvedValue(true);

    const res = await POST(signInRequest(PASSWORD));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: 'Too many failed sign-in attempts from multiple locations. Please try again later.',
    });
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  });

  it('does not issue a session while per-IP locked out', async () => {
    limiter.isLoginBlocked.mockResolvedValue(true);
    const res = await POST(signInRequest(PASSWORD));
    expect(limiter.clearLoginAttempts).not.toHaveBeenCalled();
    expect(limiter.clearGlobalLoginAttempts).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
  });

  it('does not issue a session while globally locked out', async () => {
    limiter.isGlobalLoginBlocked.mockResolvedValue(true);
    const res = await POST(signInRequest(PASSWORD));
    expect(limiter.clearLoginAttempts).not.toHaveBeenCalled();
    expect(limiter.clearGlobalLoginAttempts).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
  });

  it('counts a missing or malformed password as a failed attempt', async () => {
    const res = await POST(signInRequest(undefined));
    expect(res.status).toBe(401);
    expect(limiter.recordFailedLogin).toHaveBeenCalled();
    expect(limiter.recordGlobalFailedLogin).toHaveBeenCalled();
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

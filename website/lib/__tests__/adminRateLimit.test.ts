/**
 * Contract tests for admin sign-in throttling.
 *
 * The admin area is guarded by one shared password, so this limiter is the
 * main defence against someone guessing it. The behaviour that matters:
 * a lockout must survive a restart, apply across instances, and never be
 * something an attacker can reset on demand — while a legitimate admin who
 * mistypes is not punished, and a database outage does not lock the team out
 * of their own CMS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseServer } = vi.hoisted(() => ({ getSupabaseServer: vi.fn() }));
vi.mock('../supabase-server', () => ({ getSupabaseServer }));

import {
  LOGIN_WINDOW_MS,
  MAX_LOGIN_ATTEMPTS,
  clearLoginAttempts,
  getClientIp,
  isLoginBlocked,
  recordFailedLogin,
  resetLocalAttempts,
} from '../admin-rate-limit';

const IP = '203.0.113.7';

/**
 * A stand-in for the Postgres functions in `002_admin_login_attempts.sql`,
 * shared between "instances" and unaffected by restarts.
 */
function createSharedDatabase() {
  const rows = new Map<string, { attempts: number; windowStart: number }>();
  let now = 1_700_000_000_000;
  let failNext = false;

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (failNext) return { data: null, error: { message: 'connection refused' } };

    const ip = args.p_ip as string;
    const windowMs = (args.p_window_ms as number) ?? LOGIN_WINDOW_MS;
    const row = rows.get(ip);
    const fresh = row !== undefined && now - row.windowStart < windowMs;

    if (fn === 'admin_login_attempt_count') {
      return { data: fresh ? row!.attempts : 0, error: null };
    }
    if (fn === 'admin_login_record_failure') {
      const next = fresh
        ? { attempts: row!.attempts + 1, windowStart: row!.windowStart }
        : { attempts: 1, windowStart: now };
      rows.set(ip, next);
      return { data: next.attempts, error: null };
    }
    if (fn === 'admin_login_clear') {
      rows.delete(ip);
      return { data: null, error: null };
    }
    throw new Error(`unexpected rpc: ${fn}`);
  });

  return {
    rpc,
    /** Wire this database up as the store the app sees. */
    connect: () => getSupabaseServer.mockReturnValue({ rpc }),
    /** Everything the process was holding in memory is gone. */
    restartProcess: () => resetLocalAttempts(),
    advance: (ms: number) => { now += ms; },
    setFailing: (value: boolean) => { failNext = value; },
    rows,
  };
}

/** Use up the whole allowance. */
async function exhaustAttempts(ip = IP) {
  for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) await recordFailedLogin(ip);
}

beforeEach(() => {
  resetLocalAttempts();
  getSupabaseServer.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin sign-in throttling', () => {
  it('allows a fresh IP to try', async () => {
    createSharedDatabase().connect();
    expect(await isLoginBlocked(IP)).toBe(false);
  });

  it('does not punish an admin who mistypes a few times', async () => {
    createSharedDatabase().connect();

    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i += 1) {
      expect(await recordFailedLogin(IP)).toBe(false);
      expect(await isLoginBlocked(IP)).toBe(false);
    }
  });

  it('locks out an IP once the allowance is used up', async () => {
    createSharedDatabase().connect();

    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i += 1) await recordFailedLogin(IP);
    // The final failure reports the lockout on the same response.
    expect(await recordFailedLogin(IP)).toBe(true);
    expect(await isLoginBlocked(IP)).toBe(true);
  });

  it('keeps the lockout after the site restarts', async () => {
    // This is the whole point of the task: an attacker must not be able to
    // clear their lockout by waiting for a restart or redeploy.
    const db = createSharedDatabase();
    db.connect();
    await exhaustAttempts();
    expect(await isLoginBlocked(IP)).toBe(true);

    db.restartProcess();
    db.connect();

    expect(await isLoginBlocked(IP)).toBe(true);
  });

  it('keeps the lockout for the full window across repeated restarts', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaustAttempts();

    for (let minute = 1; minute < 15; minute += 1) {
      db.restartProcess();
      db.connect();
      db.advance(60 * 1000);
      expect(await isLoginBlocked(IP)).toBe(true);
    }
  });

  it('applies the lockout to every instance, not just the one that saw the guesses', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaustAttempts();

    // A second instance has an empty memory but shares the database.
    db.restartProcess();
    db.connect();

    expect(await isLoginBlocked(IP)).toBe(true);
  });

  it('lets the IP try again once the window has passed', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaustAttempts();
    expect(await isLoginBlocked(IP)).toBe(true);

    db.advance(LOGIN_WINDOW_MS + 1000);
    db.restartProcess();

    expect(await isLoginBlocked(IP)).toBe(false);
  });

  it('clears the record after a correct password', async () => {
    const db = createSharedDatabase();
    db.connect();
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i += 1) await recordFailedLogin(IP);

    await clearLoginAttempts(IP);

    expect(await isLoginBlocked(IP)).toBe(false);
    expect(db.rows.has(IP)).toBe(false);
  });

  it('locks out one IP without affecting anybody else', async () => {
    createSharedDatabase().connect();
    await exhaustAttempts(IP);

    expect(await isLoginBlocked(IP)).toBe(true);
    expect(await isLoginBlocked('198.51.100.4')).toBe(false);
  });
});

describe('admin sign-in throttling — when the database is unavailable', () => {
  it('still throttles guesses using in-process counting', async () => {
    getSupabaseServer.mockReturnValue(null);

    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i += 1) {
      expect(await recordFailedLogin(IP)).toBe(false);
    }
    expect(await recordFailedLogin(IP)).toBe(true);
    expect(await isLoginBlocked(IP)).toBe(true);
  });

  it('does not lock the team out of the CMS when Postgres errors', async () => {
    const db = createSharedDatabase();
    db.connect();
    db.setFailing(true);

    // Degrades to local counting rather than refusing every sign-in.
    expect(await isLoginBlocked(IP)).toBe(false);
    expect(await recordFailedLogin(IP)).toBe(false);
  });

  it('remembers failures recorded before the database went down', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaustAttempts();

    db.setFailing(true);

    // The local mirror carries the lockout through the outage.
    expect(await isLoginBlocked(IP)).toBe(true);
  });

  it('expires the local window so an outage cannot lock an IP out forever', async () => {
    getSupabaseServer.mockReturnValue(null);
    const start = 1_700_000_000_000;

    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) await recordFailedLogin(IP, start);
    expect(await isLoginBlocked(IP, start)).toBe(true);

    expect(await isLoginBlocked(IP, start + LOGIN_WINDOW_MS + 1)).toBe(false);
  });
});

describe('identifying the caller', () => {
  const headers = (values: Record<string, string>) => ({
    headers: { get: (name: string) => values[name] ?? null },
  });

  it('uses the original client address from behind the proxy', () => {
    expect(
      getClientIp(headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })),
    ).toBe('203.0.113.7');
  });

  it('falls back to the real-ip header', () => {
    expect(getClientIp(headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('does not treat an empty forwarded header as a distinct caller', () => {
    // Returning '' here would give every header-stripped request its own
    // bucket and defeat the limit.
    expect(getClientIp(headers({ 'x-forwarded-for': '   ' }))).toBe('unknown');
    expect(getClientIp(headers({}))).toBe('unknown');
  });
});

/**
 * Contract tests for durable rate limiting.
 *
 * The behaviour that matters: a limit must survive a restart, apply across
 * instances, and not be something a spammer can reset on demand — while a
 * genuine visitor is unaffected, a database outage does not take a public form
 * offline, and the in-process fallback does not grow without bound.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseServer } = vi.hoisted(() => ({ getSupabaseServer: vi.fn() }));
vi.mock('../supabase-server', () => ({ getSupabaseServer }));

import {
  consumeRateLimit,
  getClientIp,
  localRateLimitSize,
  resetLocalRateLimits,
  type RateLimit,
} from '../rate-limit';

const HOUR = 60 * 60 * 1000;
const LIMIT: RateLimit = { scope: 'waitlist', windowMs: HOUR, max: 5 };
const IP = '203.0.113.7';

/**
 * A stand-in for the Postgres functions in `003_rate_limit_counters.sql`,
 * shared between "instances" and unaffected by restarts.
 */
function createSharedDatabase() {
  const rows = new Map<string, { count: number; windowStart: number }>();
  let now = 1_700_000_000_000;
  let failing = false;

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (failing) return { data: null, error: { message: 'connection refused' } };

    const id = `${args.p_scope}:${args.p_key}`;
    const windowMs = args.p_window_ms as number;
    const row = rows.get(id);
    const fresh = row !== undefined && now - row.windowStart < windowMs;

    if (fn === 'rate_limit_consume') {
      const next = fresh
        ? { count: row!.count + 1, windowStart: row!.windowStart }
        : { count: 1, windowStart: now };
      rows.set(id, next);
      return { data: next.count, error: null };
    }
    if (fn === 'rate_limit_peek') {
      return { data: fresh ? row!.count : 0, error: null };
    }
    throw new Error(`unexpected rpc: ${fn}`);
  });

  return {
    connect: () => getSupabaseServer.mockReturnValue({ rpc }),
    /** Everything the process was holding in memory is gone. */
    restartProcess: () => resetLocalRateLimits(),
    advance: (ms: number) => { now += ms; },
    setFailing: (value: boolean) => { failing = value; },
  };
}

/** Use up the whole allowance. */
async function exhaust(key = IP) {
  for (let i = 0; i < LIMIT.max; i += 1) await consumeRateLimit(LIMIT, key);
}

beforeEach(() => {
  resetLocalRateLimits();
  getSupabaseServer.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('durable rate limiting', () => {
  it('lets a genuine visitor through', async () => {
    createSharedDatabase().connect();

    const result = await consumeRateLimit(LIMIT, IP);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
  });

  it('allows exactly the configured number of requests', async () => {
    createSharedDatabase().connect();

    for (let i = 1; i <= LIMIT.max; i += 1) {
      const result = await consumeRateLimit(LIMIT, IP);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(i);
    }
    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
  });

  it('keeps the limit after the site restarts', async () => {
    // The whole point: a spammer must not be able to clear their limit by
    // waiting for a restart or redeploy.
    const db = createSharedDatabase();
    db.connect();
    await exhaust();

    db.restartProcess();
    db.connect();

    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
  });

  it('keeps the limit for the full window across repeated restarts', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaust();

    // Stay strictly inside the hour: 11 steps of 5 minutes = 55 minutes.
    for (let step = 0; step < 11; step += 1) {
      db.restartProcess();
      db.connect();
      db.advance(5 * 60 * 1000);
      expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
    }
  });

  it('applies the limit on every instance, not just the one that saw the requests', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaust();

    // A second instance has an empty memory but shares the database.
    db.restartProcess();
    db.connect();

    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
  });

  it('counts blocked requests too, so hammering cannot wash out the limit', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaust();

    for (let i = 0; i < 20; i += 1) {
      expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
    }

    // Still blocked well inside the window.
    db.advance(30 * 60 * 1000);
    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
  });

  it('lets the visitor through again once the window has passed', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaust();

    db.advance(HOUR + 1000);
    db.restartProcess();

    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(true);
  });

  it('limits one visitor without affecting anybody else', async () => {
    createSharedDatabase().connect();
    await exhaust(IP);

    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
    expect((await consumeRateLimit(LIMIT, '198.51.100.4')).allowed).toBe(true);
  });

  it('keeps separate limits from consuming each other\'s allowance', async () => {
    createSharedDatabase().connect();
    const other: RateLimit = { scope: 'other-form', windowMs: HOUR, max: 5 };

    await exhaust(IP);

    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
    expect((await consumeRateLimit(other, IP)).allowed).toBe(true);
  });
});

describe('durable rate limiting — when the database is unavailable', () => {
  it('still limits requests using in-process counting', async () => {
    getSupabaseServer.mockReturnValue(null);

    for (let i = 0; i < LIMIT.max; i += 1) {
      expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(true);
    }
    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
  });

  it('does not take the public form offline when Postgres errors', async () => {
    const db = createSharedDatabase();
    db.connect();
    db.setFailing(true);

    // Degrades to local counting rather than rejecting a genuine visitor.
    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(true);
  });

  it('remembers requests counted before the database went down', async () => {
    const db = createSharedDatabase();
    db.connect();
    await exhaust();

    db.setFailing(true);

    // The local mirror carries the limit through the outage.
    expect((await consumeRateLimit(LIMIT, IP)).allowed).toBe(false);
  });

  it('expires the local window so an outage cannot block a visitor forever', async () => {
    getSupabaseServer.mockReturnValue(null);
    const start = 1_700_000_000_000;

    for (let i = 0; i < LIMIT.max + 3; i += 1) await consumeRateLimit(LIMIT, IP, start);
    expect((await consumeRateLimit(LIMIT, IP, start)).allowed).toBe(false);

    expect((await consumeRateLimit(LIMIT, IP, start + HOUR + 1)).allowed).toBe(true);
  });

  it('does not accumulate an entry for every address it has ever seen', async () => {
    // The old in-memory limiter never removed elapsed windows, so the map grew
    // for the lifetime of the process.
    getSupabaseServer.mockReturnValue(null);
    const start = 1_700_000_000_000;

    for (let i = 0; i < 500; i += 1) {
      await consumeRateLimit(LIMIT, `10.0.0.${i}`, start);
    }
    expect(localRateLimitSize()).toBe(500);

    // Once those windows elapse, a later request clears them out.
    await consumeRateLimit(LIMIT, 'someone-else', start + HOUR + 1);
    expect(localRateLimitSize()).toBe(1);
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

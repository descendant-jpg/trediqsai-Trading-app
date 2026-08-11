/**
 * Rate limiting for admin sign-in.
 *
 * The whole admin area sits behind one shared password, so throttling guesses
 * is the main thing slowing down a brute-force attempt. Counting attempts in a
 * module-level Map is not enough: the count dies with the process on every
 * restart or redeploy, and separate instances each keep their own tally, so an
 * attacker can reset the limit at will.
 *
 * Attempts are therefore recorded in Postgres (via Supabase), which survives
 * restarts and is shared across instances. When Supabase is unreachable or not
 * configured we fall back to an in-process counter — weaker, but it still
 * throttles the common case, and it never locks a legitimate admin out of the
 * CMS because the database is having a bad day.
 *
 * Only *failed* attempts count, and a correct password clears the record, so
 * an admin who mistypes a couple of times is not left near the limit.
 *
 * Two independent counters run in parallel:
 *
 *  1. Per-IP  — capped at MAX_LOGIN_ATTEMPTS per window.  Stops an individual
 *               address from making many guesses.
 *
 *  2. Global  — capped at MAX_GLOBAL_LOGIN_ATTEMPTS per window.  Stops an
 *               attacker who spreads guesses across a pool of addresses (a
 *               botnet, VPN rotation, or plain IPv6) from exceeding that total
 *               across all IPs.  Stored under the sentinel key "__global__" in
 *               the same admin_login_attempts table so it shares the same
 *               durability guarantees.
 *
 * A correct password clears both counters.
 */
import { getSupabaseServer } from './supabase-server';

/** How long a window lasts before the count resets. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Failed attempts allowed per IP per window. */
export const MAX_LOGIN_ATTEMPTS = 10;

/**
 * Total failed attempts allowed across ALL IPs per window.
 *
 * Set at 5× the per-IP cap so that a single attacker cycling through enough
 * addresses to bypass the per-IP check is still slowed down globally, while a
 * legitimate admin who mistypes a few times from a new location is nowhere near
 * this threshold.
 */
export const MAX_GLOBAL_LOGIN_ATTEMPTS = 50;

/**
 * Sentinel key used to store the global counter in the same
 * admin_login_attempts table as the per-IP rows.  The double underscores make
 * it an invalid IPv4/IPv6 address so it can never collide with a real caller.
 */
export const GLOBAL_ATTEMPTS_KEY = '__global__';

// ---------------------------------------------------------------------------
// In-process fallback, used only when Postgres is unavailable
// ---------------------------------------------------------------------------
type Window = { attempts: number; windowStart: number };
const localAttempts = new Map<string, Window>();

/** Drop windows that have already elapsed so the map cannot grow forever. */
function pruneLocal(now: number): void {
  for (const [ip, window] of localAttempts) {
    if (now - window.windowStart >= LOGIN_WINDOW_MS) localAttempts.delete(ip);
  }
}

function localCount(key: string, now: number): number {
  const window = localAttempts.get(key);
  if (!window || now - window.windowStart >= LOGIN_WINDOW_MS) return 0;
  return window.attempts;
}

function localRecordFailure(key: string, now: number): number {
  pruneLocal(now);
  const window = localAttempts.get(key);
  if (!window || now - window.windowStart >= LOGIN_WINDOW_MS) {
    localAttempts.set(key, { attempts: 1, windowStart: now });
    return 1;
  }
  window.attempts += 1;
  return window.attempts;
}

/** Exposed so tests can start from a clean slate. */
export function resetLocalAttempts(): void {
  localAttempts.clear();
}

// ---------------------------------------------------------------------------
// Durable store
// ---------------------------------------------------------------------------

/**
 * A database hiccup must not lock admins out of their own CMS, so failures
 * here degrade to the in-process counter rather than denying the sign-in.
 */
function warnDegraded(operation: string, detail: unknown): void {
  const message = detail instanceof Error ? detail.message : String(detail);
  console.warn(
    `[admin-rate-limit] ${operation} failed; falling back to in-process counting: ${message}`,
  );
}

// ---------------------------------------------------------------------------
// Per-IP helpers
// ---------------------------------------------------------------------------

/** True when this IP has already used up its attempts for the current window. */
export async function isLoginBlocked(ip: string, now = Date.now()): Promise<boolean> {
  const supabase = getSupabaseServer();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('admin_login_attempt_count', {
        p_ip: ip,
        p_window_ms: LOGIN_WINDOW_MS,
      });
      if (error) throw new Error(error.message);
      return (data ?? 0) >= MAX_LOGIN_ATTEMPTS;
    } catch (err) {
      warnDegraded('attempt lookup', err);
    }
  }

  return localCount(ip, now) >= MAX_LOGIN_ATTEMPTS;
}

/**
 * Record one failed sign-in for this IP. Returns true when that failure has
 * now used up the per-IP allowance, so the caller can report the lockout on
 * the same response.
 */
export async function recordFailedLogin(ip: string, now = Date.now()): Promise<boolean> {
  const supabase = getSupabaseServer();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('admin_login_record_failure', {
        p_ip: ip,
        p_window_ms: LOGIN_WINDOW_MS,
      });
      if (error) throw new Error(error.message);
      // Mirror it locally so a later database outage does not forget the
      // failures we already know about.
      localRecordFailure(ip, now);
      return (data ?? 0) >= MAX_LOGIN_ATTEMPTS;
    } catch (err) {
      warnDegraded('attempt record', err);
    }
  }

  return localRecordFailure(ip, now) >= MAX_LOGIN_ATTEMPTS;
}

/** Forget this IP's failures after a correct password. */
export async function clearLoginAttempts(ip: string): Promise<void> {
  localAttempts.delete(ip);

  const supabase = getSupabaseServer();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('admin_login_clear', { p_ip: ip });
    if (error) throw new Error(error.message);
  } catch (err) {
    // Not security-critical: the window expires on its own.
    warnDegraded('attempt clear', err);
  }
}

// ---------------------------------------------------------------------------
// Global helpers
// ---------------------------------------------------------------------------

/**
 * True when the total number of failed sign-in attempts from all IPs in the
 * current window has reached MAX_GLOBAL_LOGIN_ATTEMPTS.
 *
 * This check stops an attacker who spreads guesses across many addresses from
 * exceeding the global budget even if no single address trips the per-IP cap.
 */
export async function isGlobalLoginBlocked(now = Date.now()): Promise<boolean> {
  const supabase = getSupabaseServer();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('admin_login_attempt_count', {
        p_ip: GLOBAL_ATTEMPTS_KEY,
        p_window_ms: LOGIN_WINDOW_MS,
      });
      if (error) throw new Error(error.message);
      return (data ?? 0) >= MAX_GLOBAL_LOGIN_ATTEMPTS;
    } catch (err) {
      warnDegraded('global attempt lookup', err);
    }
  }

  return localCount(GLOBAL_ATTEMPTS_KEY, now) >= MAX_GLOBAL_LOGIN_ATTEMPTS;
}

/**
 * Increment the global failed-login counter. Returns true when the global
 * allowance is now exhausted, so the caller can report it on the same response.
 */
export async function recordGlobalFailedLogin(now = Date.now()): Promise<boolean> {
  const supabase = getSupabaseServer();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('admin_login_record_failure', {
        p_ip: GLOBAL_ATTEMPTS_KEY,
        p_window_ms: LOGIN_WINDOW_MS,
      });
      if (error) throw new Error(error.message);
      localRecordFailure(GLOBAL_ATTEMPTS_KEY, now);
      return (data ?? 0) >= MAX_GLOBAL_LOGIN_ATTEMPTS;
    } catch (err) {
      warnDegraded('global attempt record', err);
    }
  }

  return localRecordFailure(GLOBAL_ATTEMPTS_KEY, now) >= MAX_GLOBAL_LOGIN_ATTEMPTS;
}

/**
 * Reset the global counter after a correct password.
 *
 * Clearing the global counter on a successful sign-in ensures that a
 * legitimate admin who gets the right password in after an attacker has been
 * flooding guesses starts the next window with a clean slate.
 */
export async function clearGlobalLoginAttempts(): Promise<void> {
  localAttempts.delete(GLOBAL_ATTEMPTS_KEY);

  const supabase = getSupabaseServer();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('admin_login_clear', {
      p_ip: GLOBAL_ATTEMPTS_KEY,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    warnDegraded('global attempt clear', err);
  }
}

/** Best-effort client IP, accounting for the proxy in front of the app. */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

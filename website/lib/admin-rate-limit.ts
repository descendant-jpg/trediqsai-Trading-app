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
 */
import { getSupabaseServer } from './supabase-server';

/** How long a window lasts before the count resets. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Failed attempts allowed per IP per window. */
export const MAX_LOGIN_ATTEMPTS = 10;

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

function localCount(ip: string, now: number): number {
  const window = localAttempts.get(ip);
  if (!window || now - window.windowStart >= LOGIN_WINDOW_MS) return 0;
  return window.attempts;
}

function localRecordFailure(ip: string, now: number): number {
  pruneLocal(now);
  const window = localAttempts.get(ip);
  if (!window || now - window.windowStart >= LOGIN_WINDOW_MS) {
    localAttempts.set(ip, { attempts: 1, windowStart: now });
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
 * Record one failed sign-in. Returns true when that failure has now used up
 * the allowance, so the caller can report the lockout on the same response.
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

/** Forget an IP's failures after a correct password. */
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

/** Best-effort client IP, accounting for the proxy in front of the app. */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

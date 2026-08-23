/**
 * Durable request rate limiting.
 *
 * Counting requests in a module-level Map is not enough for anything that
 * matters: the count dies with the process on every restart or redeploy, and
 * separate instances each keep their own tally, so a spammer can reset their
 * allowance simply by waiting or by landing on another instance. It also grows
 * forever, because nothing ever removes elapsed windows.
 *
 * Counts therefore live in Postgres (via Supabase), which survives restarts and
 * is shared across instances. When Supabase is unreachable or not configured we
 * fall back to an in-process counter: weaker, but it still throttles the common
 * case, and a database hiccup never takes a public form offline.
 *
 * `scope` keeps unrelated limits apart so they cannot consume each other's
 * allowance.
 */
import { getSupabaseServer } from './supabase-server';

export type RateLimit = {
  /** Namespace for this limit, e.g. 'waitlist'. */
  scope: string;
  /** How long a window lasts before the count resets. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
};

export type RateLimitResult = {
  /** False when the caller has used up their allowance. */
  allowed: boolean;
  /** Requests used in the current window, including this one. */
  count: number;
};

// ---------------------------------------------------------------------------
// In-process fallback, used only when Postgres is unavailable
// ---------------------------------------------------------------------------
type Window = { count: number; windowStart: number };
const localCounters = new Map<string, Window>();

const localKey = (scope: string, key: string) => `${scope}:${key}`;

/**
 * Drop windows that have already elapsed. Without this the map grows for the
 * lifetime of the process — one entry per address ever seen.
 */
function pruneLocal(windowMs: number, now: number): void {
  for (const [key, window] of localCounters) {
    if (now - window.windowStart >= windowMs) localCounters.delete(key);
  }
}

function localConsume(limit: RateLimit, key: string, now: number): number {
  pruneLocal(limit.windowMs, now);

  const id = localKey(limit.scope, key);
  const window = localCounters.get(id);
  if (!window || now - window.windowStart >= limit.windowMs) {
    localCounters.set(id, { count: 1, windowStart: now });
    return 1;
  }
  window.count += 1;
  return window.count;
}

/** Exposed so tests can start from a clean slate. */
export function resetLocalRateLimits(): void {
  localCounters.clear();
}

/** How many entries the in-process fallback is holding (for tests). */
export function localRateLimitSize(): number {
  return localCounters.size;
}

// ---------------------------------------------------------------------------
// Durable store
// ---------------------------------------------------------------------------

function warnDegraded(scope: string, detail: unknown): void {
  const message = detail instanceof Error ? detail.message : String(detail);
  console.warn(
    `[rate-limit:${scope}] durable counter unavailable; falling back to in-process counting: ${message}`,
  );
}

/**
 * Consume one unit of allowance for `key`.
 *
 * Always records the request, whether or not it is allowed, so hammering the
 * endpoint cannot wash out the count.
 */
export async function consumeRateLimit(
  limit: RateLimit,
  key: string,
  now = Date.now(),
): Promise<RateLimitResult> {
  const supabase = getSupabaseServer();

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('rate_limit_consume', {
        p_scope: limit.scope,
        p_key: key,
        p_window_ms: limit.windowMs,
      });
      if (error) throw new Error(error.message);

      const count = data ?? 0;
      // Mirror locally so a later database outage does not forget requests we
      // already counted.
      localConsume(limit, key, now);
      return { allowed: count <= limit.max, count };
    } catch (err) {
      warnDegraded(limit.scope, err);
    }
  }

  const count = localConsume(limit, key, now);
  return { allowed: count <= limit.max, count };
}

/** Best-effort client IP, accounting for the proxy in front of the app. */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

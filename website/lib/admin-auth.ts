/**
 * Admin session helpers.
 *
 * The admin area is protected by a single shared password (`ADMIN_PASSWORD`).
 * A successful sign-in issues an HMAC-signed, httpOnly cookie derived from
 * `SESSION_SECRET`. Both values are server-only and are never sent to the client.
 *
 * A session token carries both when it was first issued and when it expires:
 *
 *     <issuedAt>.<expiresAt>.<signature>
 *
 * `issuedAt` is the original sign-in time and is preserved across refreshes, so
 * sliding the session forward can never push it past an absolute ceiling
 * (`ADMIN_SESSION_MAX_HOURS`, default 24 hours from first login). After the
 * ceiling the admin must sign in with the password again.
 *
 * Rotating `SESSION_SECRET` invalidates every existing token immediately,
 * because the HMAC signature no longer verifies.
 *
 * Calling `revokeAllSessions()` writes a revocation epoch to Supabase Storage.
 * Because Storage is external and shared, every serving instance reads the same
 * value on the next request without any per-process cache. Tokens whose
 * `issuedAt` is at or below the epoch are denied; fresh sign-ins after that
 * point produce tokens with a later `issuedAt` and are accepted normally.
 *
 * If the Supabase Storage read fails for any reason other than "object not yet
 * created", `readSessionToken` returns null (fail closed) — a transient outage
 * cannot be leveraged to bypass the revocation check.
 *
 * Everything here uses Web Crypto so the same code runs in Node.js middleware
 * and in route handlers / server components.
 */

import { createClient } from '@supabase/supabase-js';

export const ADMIN_COOKIE = 'tq_admin_session';

// ---------------------------------------------------------------------------
// Session revocation — backed by Supabase Storage for cross-instance consistency
// ---------------------------------------------------------------------------

/**
 * Private Storage bucket and object that hold the revocation epoch.
 * The bucket is created automatically on first revocation.
 */
const REVOCATION_BUCKET = 'admin-internal';
const REVOCATION_OBJECT = 'session-revocation-epoch';

/**
 * Return a service-role Supabase client, or null when credentials are not
 * configured. Created on demand so environment variables are always read at
 * request time rather than at module load.
 *
 * `cache: 'no-store'` is set on every outgoing fetch so that neither
 * Next.js's extended fetch cache nor any HTTP cache can serve a stale
 * revocation epoch after a "sign out all devices" call.
 */
function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input as RequestInfo, { ...init, cache: 'no-store' }),
    },
  });
}

/**
 * Return the revocation epoch (ms since epoch) from Supabase Storage.
 * Any session token whose `issuedAt` is at or below this value is invalid.
 *
 * - Returns 0 when no revocation has been issued yet (object absent) or when
 *   Supabase is not configured (in which case `revokeAllSessions` is also
 *   unavailable).
 * - Throws on any unexpected Storage error so the caller (`readSessionToken`)
 *   can fail closed — denying access rather than silently skipping the check.
 *
 * No in-process cache is used: every call reads from Supabase Storage so all
 * serving instances observe revocations on their very next request.
 */
export async function getRevocationTimestamp(): Promise<number> {
  const db = getAdminDb();
  if (!db) return 0;

  const { data, error } = await db.storage
    .from(REVOCATION_BUCKET)
    .download(REVOCATION_OBJECT);

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    // Object or bucket not found → no revocation has been issued yet.
    if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('404')) {
      return 0;
    }
    // Any other failure: propagate so readSessionToken can fail closed.
    throw new Error(`Admin revocation check failed: ${error.message}`);
  }

  const text = await (data as Blob).text();
  return Number(text.trim()) || 0;
}

/**
 * Invalidate every existing admin session immediately across all serving
 * instances. The epoch is written to Supabase Storage; every instance reads it
 * on the next request with no per-process cache to clear.
 *
 * The private bucket is created automatically if it does not yet exist.
 * Throws when Supabase is not configured or the write fails.
 */
export async function revokeAllSessions(now = Date.now()): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('Supabase is not configured; cannot revoke sessions.');

  // Ensure the private bucket exists. createBucket is idempotent: the error
  // returned when the bucket already exists is intentionally ignored.
  await db.storage.createBucket(REVOCATION_BUCKET, { public: false });

  const blob = new Blob([String(now)], { type: 'text/plain' });
  const { error } = await db.storage
    .from(REVOCATION_BUCKET)
    .upload(REVOCATION_OBJECT, blob, {
      upsert: true,
      contentType: 'text/plain',
      // max-age=0 ensures HTTP caches always revalidate; no-store prevents
      // any intermediate cache from serving a stale epoch after a revoke.
      cacheControl: '0',
    });

  if (error) throw new Error(`Failed to revoke admin sessions: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Session lifetime constants
// ---------------------------------------------------------------------------

/** Sliding session lifetime: how far ahead each issued token expires. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Default absolute ceiling measured from the original sign-in. */
const DEFAULT_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Absolute ceiling for a single sign-in, in ms. Configurable with
 * `ADMIN_SESSION_MAX_HOURS`; falls back to 24 hours when unset or invalid.
 * Never shorter than one sliding period, so a fresh login is always usable.
 */
export function getMaxSessionLifetimeMs(): number {
  const raw = process.env.ADMIN_SESSION_MAX_HOURS;
  const hours = raw === undefined ? NaN : Number(raw);
  const configured =
    Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : DEFAULT_MAX_LIFETIME_MS;
  return Math.max(configured, SESSION_TTL_MS);
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(signature);
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Public auth helpers
// ---------------------------------------------------------------------------

/** True when the shared admin password and session secret are both configured. */
export function isAdminAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

/** Verify a submitted password against `ADMIN_PASSWORD`. */
export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export type SessionInfo = {
  /** Original sign-in time (ms since epoch), preserved across refreshes. */
  issuedAt: number;
  /** When this token stops being accepted (ms since epoch). */
  expiresAt: number;
  /** Hard ceiling for this sign-in (ms since epoch). Never extended. */
  absoluteExpiresAt: number;
};

/** Build a signed token for the given sign-in time and expiry. */
async function buildToken(issuedAt: number, expiresAt: number): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const payload = `${issuedAt}.${expiresAt}`;
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * Create a session token for a fresh sign-in. The absolute ceiling starts now.
 */
export async function createSessionToken(now = Date.now()): Promise<string | null> {
  const expiresAt = Math.min(now + SESSION_TTL_MS, now + getMaxSessionLifetimeMs());
  return buildToken(now, expiresAt);
}

/** Sliding session lifetime in seconds — the longest a cookie should live. */
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/** Cookie max-age (seconds) for a token that expires at `expiresAt`. */
export function cookieMaxAgeSeconds(expiresAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/**
 * Parse and verify a session token.
 *
 * Returns `null` when the token is missing, malformed, has an invalid
 * signature, has expired, has passed its absolute ceiling, or was issued at or
 * before the current revocation epoch (set by `revokeAllSessions`).
 *
 * Also returns `null` when the revocation check itself fails — failing closed
 * ensures a transient Supabase outage cannot be used to bypass revocation.
 */
export async function readSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<SessionInfo | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;

  const parts = token.split('.');
  // Legacy two-part tokens (no issued-at) are no longer accepted — without a
  // sign-in time we cannot enforce the ceiling, so those sessions must re-auth.
  if (parts.length !== 3) return null;

  const [issuedAtRaw, expiresAtRaw, signature] = parts;
  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;

  const expected = await sign(`${issuedAtRaw}.${expiresAtRaw}`, secret);
  if (!safeEqual(signature, expected)) return null;

  if (expiresAt <= now) return null;

  // Enforce the ceiling here as well, so a clamping mistake elsewhere can never
  // keep a session alive beyond its maximum lifetime.
  const absoluteExpiresAt = issuedAt + getMaxSessionLifetimeMs();
  if (absoluteExpiresAt <= now) return null;

  // Reject tokens issued at or before the last "sign out all devices" call.
  // Using <= ensures same-millisecond tokens are also caught.
  // On any unexpected read failure, fail closed: return null rather than
  // silently skipping the revocation check.
  let revokedBefore: number;
  try {
    revokedBefore = await getRevocationTimestamp();
  } catch {
    return null;
  }
  if (issuedAt <= revokedBefore) return null;

  return { issuedAt, expiresAt, absoluteExpiresAt };
}

/** Validate a session token's signature, expiry, ceiling, and revocation status. */
export async function isValidSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  return (await readSessionToken(token, now)) !== null;
}

/**
 * Return the expiry timestamp (ms since epoch) from a valid session token,
 * or `null` if the token is missing, malformed, expired, past its ceiling,
 * has an invalid signature, or has been revoked.
 */
export async function getSessionExpiry(
  token: string | undefined | null,
  now = Date.now(),
): Promise<number | null> {
  const session = await readSessionToken(token, now);
  return session?.expiresAt ?? null;
}

export type RefreshResult =
  | { status: 'ok'; token: string; session: SessionInfo }
  | { status: 'unauthenticated' }
  | { status: 'ceiling_reached'; session: SessionInfo }
  | { status: 'not_configured' };

/**
 * Slide an existing session forward, keeping the original sign-in time.
 *
 * The new expiry is clamped to the absolute ceiling. When the ceiling leaves
 * nothing meaningful to extend, the refresh is refused and the admin must sign
 * in again.
 */
export async function refreshSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<RefreshResult> {
  const session = await readSessionToken(token, now);
  if (!session) return { status: 'unauthenticated' };

  const expiresAt = Math.min(now + SESSION_TTL_MS, session.absoluteExpiresAt);

  // Nothing left to give: the ceiling is already at or before the current
  // expiry, so refreshing would not extend the session.
  if (expiresAt <= session.expiresAt) {
    return { status: 'ceiling_reached', session };
  }

  const nextToken = await buildToken(session.issuedAt, expiresAt);
  if (!nextToken) return { status: 'not_configured' };

  return {
    status: 'ok',
    token: nextToken,
    session: { ...session, expiresAt },
  };
}

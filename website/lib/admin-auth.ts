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
 * Everything here uses Web Crypto so the same code runs in middleware (Edge)
 * and in route handlers / server components.
 */

export const ADMIN_COOKIE = 'tq_admin_session';

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
 * signature, has expired, or has passed its absolute ceiling.
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

  return { issuedAt, expiresAt, absoluteExpiresAt };
}

/** Validate a session token's signature, expiry, and absolute ceiling. */
export async function isValidSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  return (await readSessionToken(token, now)) !== null;
}

/**
 * Return the expiry timestamp (ms since epoch) from a valid session token,
 * or `null` if the token is missing, malformed, expired, past its ceiling,
 * or has an invalid signature.
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

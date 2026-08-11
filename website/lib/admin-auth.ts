/**
 * Admin session helpers.
 *
 * The admin area is protected by a single shared password (`ADMIN_PASSWORD`).
 * A successful sign-in issues an HMAC-signed, httpOnly cookie derived from
 * `SESSION_SECRET`. Both values are server-only and are never sent to the client.
 *
 * Everything here uses Web Crypto so the same code runs in middleware (Edge)
 * and in route handlers / server components.
 */

export const ADMIN_COOKIE = 'tq_admin_session';

/** Session lifetime: 12 hours. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

/** Create a signed session token valid for `SESSION_TTL_MS`. */
export async function createSessionToken(now = Date.now()): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const expiresAt = String(now + SESSION_TTL_MS);
  const signature = await sign(expiresAt, secret);
  return `${expiresAt}.${signature}`;
}

/** Session cookie max-age in seconds. */
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/** Validate a session token's signature and expiry. */
export async function isValidSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return false;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return false;

  const expected = await sign(expiresAt, secret);
  return safeEqual(signature, expected);
}

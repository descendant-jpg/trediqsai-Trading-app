import type { NextFunction, Request, Response } from "express";

/**
 * Resolves a bearer token into a stable user id, or null when the token is
 * invalid/expired. Injectable so tests don't need a live auth backend.
 */
export type TokenVerifier = (token: string) => Promise<string | null>;

/** Identity assigned to requests that carry no Authorization header. */
export const ANONYMOUS_USER = "anonymous";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_KEY =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ??
  // The project uses the Supabase anon key under these names:
  process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ??
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ??
  "";

/** How long a successfully verified token is trusted without re-checking. */
const VERIFY_CACHE_MS = 5 * 60_000;
const VERIFY_CACHE_MAX = 1_000;

const verifyCache = new Map<string, { userId: string; expiresAt: number }>();

/**
 * Default verifier: asks Supabase Auth who the token belongs to.
 * Algorithm-agnostic (works for both HS256 and asymmetric signing keys)
 * because Supabase itself validates the JWT. Results are cached briefly so
 * polling endpoints don't add a network hop per request.
 */
async function verifySupabaseToken(token: string, cacheVerifiedTokens: boolean): Promise<string | null> {
  if (cacheVerifiedTokens) {
    const cached = verifyCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.userId;
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: string };
  if (!body.id) return null;

  if (cacheVerifiedTokens) {
    if (verifyCache.size >= VERIFY_CACHE_MAX) {
      // Drop the oldest entry (Map preserves insertion order).
      const oldest = verifyCache.keys().next().value;
      if (oldest !== undefined) verifyCache.delete(oldest);
    }
    verifyCache.set(token, {
      userId: body.id,
      expiresAt: Date.now() + VERIFY_CACHE_MS,
    });
  }
  return body.id;
}

export const isAuthConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

/**
 * Middleware that resolves the caller's identity into `res.locals.userId`.
 *
 * - No Authorization header → the shared ANONYMOUS_USER identity (the app
 *   still works signed-out / before Supabase is configured).
 * - Bearer token + auth configured → verified against Supabase; an invalid
 *   or expired token gets a 401 rather than silently sharing state.
 * - Bearer token but auth NOT configured server-side → anonymous (we cannot
 *   verify, and unverified tokens must never mint identities).
 */
export function identity(
  verifier?: TokenVerifier,
  options: { cacheVerifiedTokens?: boolean } = {},
) {
  const verify =
    verifier ??
    ((token: string) =>
      verifySupabaseToken(token, options.cacheVerifiedTokens !== false));
  const configured = verifier ? true : isAuthConfigured;

  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token || !configured) {
      console.warn("API authentication not established", {
        reason: !token ? "missing_bearer_token" : "supabase_verifier_not_configured",
        path: req.path,
      });
      res.locals["userId"] = ANONYMOUS_USER;
      next();
      return;
    }

    try {
      const userId = await verify(token);
      if (!userId) {
        console.warn("API authentication rejected", { reason: "invalid_or_expired_supabase_token", path: req.path });
        res.status(401).json({ error: "Invalid or expired auth token" });
        return;
      }
      res.locals["userId"] = userId;
      next();
    } catch (err) {
      console.error("API authentication verification failed", { path: req.path, error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  };
}

/** Read the identity set by the `identity` middleware. */
export function requestUserId(res: Response): string {
  const id = res.locals["userId"];
  return typeof id === "string" && id ? id : ANONYMOUS_USER;
}

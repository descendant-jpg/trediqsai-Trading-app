import type { NextFunction, Request, Response } from "express";

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";

/** Enforces the database-owned conditional TOTP policy for sensitive API calls. */
export async function requireAal2IfMfaEnrolled(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("AAL assurance rejected", { reason: !authorization?.startsWith("Bearer ") ? "missing_bearer_token" : "supabase_configuration_missing", path: req.path });
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assert_aal2_if_mfa_enrolled`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization, "content-type": "application/json" },
    });
    if (response.ok) return next();
    if (response.status === 401 || response.status === 403) {
      console.warn("AAL assurance rejected", { reason: "mfa_assurance_required", status: response.status, path: req.path });
      res.status(403).json({ error: "Two-factor verification is required for this action." });
      return;
    }
    console.error("AAL assurance unavailable", { status: response.status, path: req.path });
    res.status(503).json({ error: "Unable to verify account security." });
  } catch (error) {
    next(error);
  }
}

/** How long a definitive AAL assurance outcome is remembered per token. */
const OUTCOME_CACHE_MS = 5 * 60_000;
const OUTCOME_CACHE_MAX = 1_000;

type AalOutcome = "ok" | "mfa_required";
const outcomeCache = new Map<string, { outcome: AalOutcome; expiresAt: number }>();

function rememberOutcome(authorization: string, outcome: AalOutcome): void {
  if (outcomeCache.size >= OUTCOME_CACHE_MAX) {
    const oldest = outcomeCache.keys().next().value;
    if (oldest !== undefined) outcomeCache.delete(oldest);
  }
  outcomeCache.set(authorization, { outcome, expiresAt: Date.now() + OUTCOME_CACHE_MS });
}

function recallOutcome(authorization: string): AalOutcome | null {
  const cached = outcomeCache.get(authorization);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    outcomeCache.delete(authorization);
    return null;
  }
  return cached.outcome;
}

/** Test-only: reset the remembered assurance outcomes. */
export function __clearAalOutcomeCache(): void {
  outcomeCache.clear();
}

/**
 * Write-endpoint variant of AAL2 assurance with availability fail-open.
 *
 * POLICY (deliberate, documented): a transient Supabase outage must never
 * lock a trader out of pausing bots or changing settings during market
 * volatility. When the `assert_aal2_if_mfa_enrolled` RPC cannot be reached
 * (5xx, network error), the request PASSES THROUGH for users whose last
 * definitive assurance outcome within the last 5 minutes was "ok" — and for
 * users with no recent definitive outcome, because MFA enrollment is opt-in
 * and the vast majority of sessions have no MFA requirement at all. Only
 * users whose most recent definitive outcome was "MFA required" stay blocked
 * (403 with the same `mfa_required` code) during the outage — they were
 * already blocked before it, so the outage removes no protection.
 *
 * Rationale for fail-open over a degraded-mode queue: every write here is
 * idempotent state configuration (toggle, asset choice, bot settings), not a
 * financial transaction — queueing would add complexity and still leave the
 * user unsure whether their pause took effect. The identity middleware
 * upstream has already verified the bearer token, so the caller is always an
 * authenticated user; the only thing skipped during an outage is the
 * step-up (TOTP freshness) check for the small MFA-enrolled minority with no
 * cached outcome, and each degraded pass is logged for audit.
 *
 * Responses never surface a 503 for AAL unavailability; a degraded pass is
 * flagged with the `X-Security-Check: degraded` response header so clients
 * can (optionally) inform the user.
 */
export async function requireAal2IfMfaEnrolledWrite(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("AAL assurance rejected (write)", { reason: !authorization?.startsWith("Bearer ") ? "missing_bearer_token" : "supabase_configuration_missing", path: req.path });
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  const failOpen = () => {
    const lastKnown = recallOutcome(authorization);
    if (lastKnown === "mfa_required") {
      // The outage removes no protection for a user we already know needs
      // step-up verification: keep them blocked with the same contract.
      console.warn("AAL assurance unavailable, keeping known-MFA user blocked", { path: req.path });
      res.status(403).json({ error: "Two-factor verification is required for this action.", code: "mfa_required" });
      return;
    }
    console.warn("AAL assurance unavailable, degraded pass-through for write endpoint", { path: req.path, lastKnown });
    res.setHeader("X-Security-Check", "degraded");
    next();
  };
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assert_aal2_if_mfa_enrolled`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization, "content-type": "application/json" },
    });
    if (response.ok) {
      rememberOutcome(authorization, "ok");
      return next();
    }
    if (response.status === 401 || response.status === 403) {
      rememberOutcome(authorization, "mfa_required");
      console.warn("AAL assurance rejected (write)", { reason: "mfa_assurance_required", status: response.status, path: req.path });
      res.status(403).json({ error: "Two-factor verification is required for this action.", code: "mfa_required" });
      return;
    }
    failOpen();
  } catch {
    failOpen();
  }
}

/**
 * Soft variant of AAL2 assurance for read-only polling endpoints.
 *
 * Unlike the strict variant, a transient Supabase outage (non-401/403
 * response, network error, or missing configuration) does not block the
 * request — it passes through so that ordinary signed-in sessions are never
 * locked out by infrastructure blips. Only a definitive MFA-insufficient
 * response (401/403) is enforced, with a machine-readable `mfa_required`
 * code so clients can show a contextual nudge instead of a generic error.
 */
export async function requireAal2IfMfaEnrolledSoft(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  // No bearer token or Supabase not configured: fall through. The identity
  // middleware upstream has already resolved the caller to anonymous.
  if (!authorization?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_KEY) {
    return next();
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assert_aal2_if_mfa_enrolled`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, authorization, "content-type": "application/json" },
    });
    if (response.ok) return next();
    if (response.status === 401 || response.status === 403) {
      console.warn("AAL assurance rejected (soft)", { reason: "mfa_assurance_required", status: response.status, path: req.path });
      res.status(403).json({ error: "Two-factor verification is required to view this.", code: "mfa_required" });
      return;
    }
    // Service hiccup — pass through rather than returning 503 to the client.
    console.warn("AAL assurance unavailable, passing through for read endpoint", { status: response.status, path: req.path });
    next();
  } catch (error) {
    // Network error — pass through rather than blocking the read.
    console.warn("AAL assurance check failed, passing through for read endpoint", { error: error instanceof Error ? error.message : String(error), path: req.path });
    next();
  }
}
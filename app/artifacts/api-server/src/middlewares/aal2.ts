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
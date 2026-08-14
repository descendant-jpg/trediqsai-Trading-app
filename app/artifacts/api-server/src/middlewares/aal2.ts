import type { NextFunction, Request, Response } from "express";

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ?? "";

/** Enforces the database-owned conditional TOTP policy for sensitive API calls. */
export async function requireAal2IfMfaEnrolled(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_KEY) {
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
      res.status(403).json({ error: "Two-factor verification is required for this action." });
      return;
    }
    res.status(503).json({ error: "Unable to verify account security." });
  } catch (error) {
    next(error);
  }
}
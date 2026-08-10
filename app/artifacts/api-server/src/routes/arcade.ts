import { Router, type IRouter } from "express";
import {
  identity,
  requestUserId,
  type TokenVerifier,
} from "../middlewares/identity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArcadeEntry = { userId: string; username: string; xp: number };
export type ArcadeLeaderboardEntry = { rank: number; username: string; xp: number };

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Sorted top-10 snapshot (descending XP). */
export function buildLeaderboard(
  scores: Map<string, ArcadeEntry>,
): ArcadeLeaderboardEntry[] {
  return Array.from(scores.values())
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10)
    .map((entry, i) => ({ rank: i + 1, username: entry.username, xp: entry.xp }));
}

/** 1-based rank for a userId (total unique players + 1 when not present). */
export function computeRank(scores: Map<string, ArcadeEntry>, userId: string): number {
  const sorted = Array.from(scores.values()).sort((a, b) => b.xp - a.xp);
  const idx = sorted.findIndex((e) => e.userId === userId);
  return idx === -1 ? scores.size + 1 : idx + 1;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Build the arcade router.
 *
 * The scores Map is created fresh per call so every test instance is fully
 * isolated — no shared module-level state that leaks between test cases.
 *
 * The token verifier is injectable for tests (no live Supabase needed).
 */
export function createArcadeRouter(verifier?: TokenVerifier): IRouter {
  const router: IRouter = Router();
  // Scores are scoped to this router instance.
  const scores = new Map<string, ArcadeEntry>();

  // Identity is resolved for all /arcade routes.
  // Anonymous callers still work; an invalid token returns 401 when auth is configured.
  router.use("/arcade", identity(verifier));

  /**
   * POST /arcade/score
   * Submit the caller's current XP total.
   * Body: { xp: number, username: string }
   *
   * userId is resolved server-side from the verified bearer token — the client
   * cannot supply or forge its own identity.
   *
   * XP is monotonic: a lower submission than the stored value is silently
   * ignored so a client bug cannot erase a player's earned rank.
   */
  router.post("/arcade/score", (req, res) => {
    const { xp, username } = req.body as { xp: unknown; username: unknown };

    if (
      typeof username !== "string" ||
      username.trim().length === 0 ||
      username.length > 32 ||
      typeof xp !== "number" ||
      !Number.isInteger(xp) ||
      xp < 0
    ) {
      res.status(400).json({
        error:
          "Invalid body: xp (non-negative integer) and username (1-32 chars) required",
      });
      return;
    }

    const userId = requestUserId(res);
    const existing = scores.get(userId);
    const nextXp = existing ? Math.max(existing.xp, xp) : xp;
    scores.set(userId, { userId, username: username.trim(), xp: nextXp });

    res.json({ rank: computeRank(scores, userId), leaderboard: buildLeaderboard(scores) });
  });

  /**
   * GET /arcade/leaderboard
   * Returns the current top-10 XP leaderboard.
   */
  router.get("/arcade/leaderboard", (_req, res) => {
    res.json({ leaderboard: buildLeaderboard(scores) });
  });

  return router;
}

export default createArcadeRouter();

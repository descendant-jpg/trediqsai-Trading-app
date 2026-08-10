/**
 * Arcade player persistence helpers.
 *
 * Extracted from trading-arcade.tsx so they can be unit-tested
 * independently of React Native / AsyncStorage internals.
 */

export const ARCADE_PLAYER_KEY = 'tradiqs.arcade.player.v1';
export const XP_PER_LEVEL = 1000;

export type ArcadePlayer = {
  played: number;
  streak: number;
  today: number;
  rank: number;
  xp: number;
  lastPlayedDay: string; // YYYY-MM-DD local date
  bestScores: Record<string, number>;
};

export const DEFAULT_ARCADE_PLAYER: ArcadePlayer = {
  played: 24,
  streak: 6,
  today: 2,
  rank: 128,
  xp: 720,
  lastPlayedDay: '',
  bestScores: {},
};

/** YYYY-MM-DD using the device's local calendar. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD for the previous local calendar day. */
export function prevDayKey(date: Date = new Date()): string {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return localDateKey(prev);
}

/**
 * Compute the next player state after a completed game round.
 *
 * - `played` always increments by 1.
 * - `today` increments within the same day; resets to 1 on a new day.
 * - `streak` increments when `lastPlayedDay` was yesterday; stays when it is
 *   today (multiple games in one session); resets to 1 otherwise.
 * - `xp` increases by `xpEarned`.
 * - `lastPlayedDay` is set to today's key.
 *
 * Pure function — does NOT perform any I/O.
 */
export function computeNextPlayer(
  prev: ArcadePlayer,
  xpEarned: number,
  now: Date = new Date(),
  gameId?: string,
  score?: number,
): ArcadePlayer {
  const today = localDateKey(now);
  const yesterday = prevDayKey(now);

  const newStreak =
    prev.lastPlayedDay === yesterday ? prev.streak + 1
    : prev.lastPlayedDay === today   ? prev.streak
    : 1;

  const newToday =
    prev.lastPlayedDay === today ? prev.today + 1 : 1;

  return {
    ...prev,
    played: prev.played + 1,
    streak: newStreak,
    today: newToday,
    xp: prev.xp + xpEarned,
    lastPlayedDay: today,
    bestScores:
      gameId && typeof score === 'number' && Number.isFinite(score)
        ? { ...prev.bestScores, [gameId]: Math.max(prev.bestScores[gameId] ?? 0, score) }
        : { ...prev.bestScores },
  };
}

/**
 * Safely parse a raw JSON string from AsyncStorage into an ArcadePlayer,
 * merging with defaults so unknown/missing fields are always safe.
 */
export function parseArcadePlayer(raw: string | null | undefined): ArcadePlayer {
  if (!raw) return { ...DEFAULT_ARCADE_PLAYER };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULT_ARCADE_PLAYER };
    }
    const merged = { ...DEFAULT_ARCADE_PLAYER, ...parsed };
    return {
      ...merged,
      bestScores:
        typeof merged.bestScores === 'object' && merged.bestScores !== null && !Array.isArray(merged.bestScores)
          ? Object.fromEntries(
              Object.entries(merged.bestScores).filter(
                ([key, value]) => typeof key === 'string' && typeof value === 'number' && Number.isFinite(value) && value >= 0,
              ),
            )
          : {},
    };
  } catch {
    return { ...DEFAULT_ARCADE_PLAYER };
  }
}

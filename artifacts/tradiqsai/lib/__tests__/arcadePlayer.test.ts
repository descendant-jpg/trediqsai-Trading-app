import { describe, it, expect } from 'vitest';
import {
  computeNextPlayer,
  parseArcadePlayer,
  localDateKey,
  prevDayKey,
  DEFAULT_ARCADE_PLAYER,
  type ArcadePlayer,
} from '../arcadePlayer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<ArcadePlayer> = {}): ArcadePlayer {
  return { ...DEFAULT_ARCADE_PLAYER, ...overrides };
}

const TODAY = new Date('2026-08-10T14:00:00');
const TODAY_KEY = '2026-08-10';
const YESTERDAY_KEY = '2026-08-09';
const TWO_DAYS_AGO_KEY = '2026-08-08';

// ─── localDateKey / prevDayKey ────────────────────────────────────────────────

describe('localDateKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(localDateKey(TODAY)).toBe(TODAY_KEY);
  });
});

describe('prevDayKey', () => {
  it('returns the previous calendar day', () => {
    expect(prevDayKey(TODAY)).toBe(YESTERDAY_KEY);
  });
});

// ─── computeNextPlayer ────────────────────────────────────────────────────────

describe('computeNextPlayer', () => {
  describe('played counter', () => {
    it('increments played by 1 on every completed round', () => {
      const p = makePlayer({ played: 10, lastPlayedDay: YESTERDAY_KEY });
      const next = computeNextPlayer(p, 20, TODAY);
      expect(next.played).toBe(11);
    });
  });

  describe('today counter', () => {
    it('resets today to 1 on a new calendar day', () => {
      const p = makePlayer({ today: 5, lastPlayedDay: YESTERDAY_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.today).toBe(1);
    });

    it('increments today when playing a second game on the same day', () => {
      const p = makePlayer({ today: 1, lastPlayedDay: TODAY_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.today).toBe(2);
    });

    it('does not double-increment today if called twice same day', () => {
      const p = makePlayer({ today: 3, lastPlayedDay: TODAY_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.today).toBe(4);
    });
  });

  describe('streak counter', () => {
    it('increments streak when last played was yesterday', () => {
      const p = makePlayer({ streak: 6, lastPlayedDay: YESTERDAY_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.streak).toBe(7);
    });

    it('keeps streak unchanged when playing a second game today', () => {
      const p = makePlayer({ streak: 6, lastPlayedDay: TODAY_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.streak).toBe(6);
    });

    it('resets streak to 1 when last played was two days ago', () => {
      const p = makePlayer({ streak: 10, lastPlayedDay: TWO_DAYS_AGO_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.streak).toBe(1);
    });

    it('resets streak to 1 on first ever game (empty lastPlayedDay)', () => {
      const p = makePlayer({ streak: 0, lastPlayedDay: '' });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.streak).toBe(1);
    });
  });

  describe('xp counter', () => {
    it('adds xpEarned to existing xp', () => {
      const p = makePlayer({ xp: 720, lastPlayedDay: YESTERDAY_KEY });
      const next = computeNextPlayer(p, 35, TODAY);
      expect(next.xp).toBe(755);
    });

    it('handles 0 xp earned (missed all questions)', () => {
      const p = makePlayer({ xp: 500, lastPlayedDay: YESTERDAY_KEY });
      const next = computeNextPlayer(p, 0, TODAY);
      expect(next.xp).toBe(500);
    });
  });

  describe('lastPlayedDay', () => {
    it('always updates lastPlayedDay to today', () => {
      const p = makePlayer({ lastPlayedDay: TWO_DAYS_AGO_KEY });
      const next = computeNextPlayer(p, 10, TODAY);
      expect(next.lastPlayedDay).toBe(TODAY_KEY);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original player object', () => {
      const p = makePlayer({ played: 5, xp: 100, lastPlayedDay: YESTERDAY_KEY });
    const original = { ...p };
      computeNextPlayer(p, 20, TODAY);
      expect(p).toEqual(original);
    });
  });
});

// ─── parseArcadePlayer ────────────────────────────────────────────────────────

describe('parseArcadePlayer', () => {
  it('returns defaults for null input', () => {
    const p = parseArcadePlayer(null);
    expect(p.played).toBe(DEFAULT_ARCADE_PLAYER.played);
  });

  it('returns defaults for corrupt JSON', () => {
    const p = parseArcadePlayer('{not json}');
    expect(p.played).toBe(DEFAULT_ARCADE_PLAYER.played);
  });

  it('returns defaults for a JSON array', () => {
    const p = parseArcadePlayer('[1,2,3]');
    expect(p.played).toBe(DEFAULT_ARCADE_PLAYER.played);
  });

  it('merges valid partial payload with defaults', () => {
    const raw = JSON.stringify({ played: 99, xp: 1500 });
    const p = parseArcadePlayer(raw);
    expect(p.played).toBe(99);
    expect(p.xp).toBe(1500);
    expect(p.streak).toBe(DEFAULT_ARCADE_PLAYER.streak);
  });

  it('round-trips through JSON serialization', () => {
    const original = makePlayer({ played: 42, xp: 999, lastPlayedDay: TODAY_KEY, bestScores: { 'pip-sniper': 87 } });
    const p = parseArcadePlayer(JSON.stringify(original));
    expect(p).toEqual(original);
  });

  it('preserves valid best scores and drops invalid entries', () => {
    const p = parseArcadePlayer(JSON.stringify({ bestScores: { 'candle-runner': 120, bad: -4, nope: 'x' } }));
    expect(p.bestScores).toEqual({ 'candle-runner': 120 });
  });
});

describe('personal best scores', () => {
  it('records a new best score for a game', () => {
    const next = computeNextPlayer(makePlayer(), 20, TODAY, 'pip-sniper', 88);
    expect(next.bestScores['pip-sniper']).toBe(88);
  });

  it('keeps the existing best when a later score is lower', () => {
    const next = computeNextPlayer(makePlayer({ bestScores: { 'pip-sniper': 100 } }), 20, TODAY, 'pip-sniper', 88);
    expect(next.bestScores['pip-sniper']).toBe(100);
  });

  it('round-trips updated best scores through storage payloads', () => {
    const next = computeNextPlayer(makePlayer(), 20, TODAY, 'chart-master', 150);
    expect(parseArcadePlayer(JSON.stringify(next))).toEqual(next);
  });
});

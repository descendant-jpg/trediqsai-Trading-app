import { describe, expect, it } from 'vitest';
import {
  dayKeyInZone,
  deviceTimeZone,
  hydratePersistedState,
  isValidTimeZone,
  localDayKey,
  type PersistedState,
} from '../persistedState';
import { STARTING_BALANCE } from '../tradingLogic';

// A fixed instant: 2026-08-04 in UTC (midday, so it's also 2026-08-04 in
// every timezone from UTC-12 to UTC+11:59).
const NOW = new Date('2026-08-04T12:00:00Z');
const TODAY = '2026-08-04';

const valid: PersistedState = {
  balance: 101_250.5,
  realizedLossToday: 320,
  day: TODAY,
  tradingDayTz: 'UTC',
  position: { side: 'LONG', entryPrice: 2340, size: 10, openedAt: 1754000000 },
  history: [
    {
      side: 'SHORT',
      entryPrice: 2360,
      exitPrice: 2350,
      size: 10,
      pnl: 100,
      closedAt: 1754000001,
    },
  ],
  lastPrice: 2351.25,
};

const fresh = {
  balance: STARTING_BALANCE,
  realizedLossToday: 0,
  tradingDayTz: deviceTimeZone(),
  position: null,
  history: [],
  lastPrice: null,
};

describe('hydratePersistedState — valid payload', () => {
  it('restores every field from a well-formed same-day payload', () => {
    const s = hydratePersistedState(JSON.stringify(valid), NOW);
    expect(s).toEqual({
      balance: valid.balance,
      realizedLossToday: valid.realizedLossToday,
      tradingDayTz: valid.tradingDayTz,
      position: valid.position,
      history: valid.history,
      lastPrice: valid.lastPrice,
    });
  });
});

describe('hydratePersistedState — missing / no payload', () => {
  it('returns fresh defaults (device timezone) when nothing was stored', () => {
    expect(hydratePersistedState(null, NOW)).toEqual(fresh);
    expect(hydratePersistedState(undefined, NOW)).toEqual(fresh);
    expect(hydratePersistedState('', NOW)).toEqual(fresh);
  });
});

describe('hydratePersistedState — corrupt JSON', () => {
  it('falls back to defaults on unparseable data', () => {
    expect(hydratePersistedState('{not json', NOW)).toEqual(fresh);
  });

  it('falls back to defaults on non-object JSON', () => {
    expect(hydratePersistedState('42', NOW)).toEqual(fresh);
    expect(hydratePersistedState('"hi"', NOW)).toEqual(fresh);
    expect(hydratePersistedState('[1,2]', NOW)).toEqual(fresh);
    expect(hydratePersistedState('null', NOW)).toEqual(fresh);
  });
});

describe('hydratePersistedState — missing or invalid fields', () => {
  it('defaults each missing field individually (older shape)', () => {
    const s = hydratePersistedState(
      JSON.stringify({
        balance: 99_000,
        day: dayKeyInZone(deviceTimeZone(), NOW),
        realizedLossToday: 50,
      }),
      NOW,
    );
    expect(s.balance).toBe(99_000);
    expect(s.realizedLossToday).toBe(50);
    expect(s.position).toBeNull();
    expect(s.history).toEqual([]);
    expect(s.lastPrice).toBeNull();
  });

  it('rejects invalid balance, lastPrice, and negative losses', () => {
    const s = hydratePersistedState(
      JSON.stringify({
        balance: 'lots',
        realizedLossToday: -5,
        day: TODAY,
        tradingDayTz: 'UTC',
        lastPrice: NaN,
      }),
      NOW,
    );
    expect(s.balance).toBe(STARTING_BALANCE);
    expect(s.realizedLossToday).toBe(0);
    expect(s.lastPrice).toBeNull();
  });

  it('drops a malformed position and malformed history entries', () => {
    const s = hydratePersistedState(
      JSON.stringify({
        ...valid,
        position: { side: 'SIDEWAYS', entryPrice: 'x' },
        history: [valid.history[0], { side: 'LONG' }, 'junk', null],
      }),
      NOW,
    );
    expect(s.position).toBeNull();
    expect(s.history).toEqual(valid.history);
  });

  it('ignores extra unknown fields', () => {
    const s = hydratePersistedState(
      JSON.stringify({ ...valid, futureField: { a: 1 }, version: 9 }),
      NOW,
    );
    expect(s.balance).toBe(valid.balance);
    expect(s).not.toHaveProperty('futureField');
  });
});

describe('hydratePersistedState — daily loss reset', () => {
  it('keeps realizedLossToday on the same day', () => {
    const s = hydratePersistedState(JSON.stringify(valid), NOW);
    expect(s.realizedLossToday).toBe(320);
  });

  it('resets realizedLossToday on a new day but keeps everything else', () => {
    const s = hydratePersistedState(
      JSON.stringify(valid),
      new Date('2026-08-05T12:00:00Z'),
    );
    expect(s.realizedLossToday).toBe(0);
    expect(s.balance).toBe(valid.balance);
    expect(s.position).toEqual(valid.position);
    expect(s.history).toEqual(valid.history);
  });

  it('resets when the persisted day is missing or not a string', () => {
    expect(
      hydratePersistedState(JSON.stringify({ ...valid, day: undefined }), NOW)
        .realizedLossToday,
    ).toBe(0);
    expect(
      hydratePersistedState(JSON.stringify({ ...valid, day: 123 }), NOW)
        .realizedLossToday,
    ).toBe(0);
  });
});

describe('hydratePersistedState — pinned trading-day timezone', () => {
  it('a device timezone change does NOT reset the loss early: the day key comes from the pinned zone', () => {
    // Trader's pinned zone is New York. At 2026-08-05T02:00Z it is already
    // Aug 5 in UTC (and in any device zone at/east of UTC), but still
    // Aug 4, 10pm in New York — so the loss must survive.
    const payload: PersistedState = {
      ...valid,
      tradingDayTz: 'America/New_York',
      day: '2026-08-04',
      realizedLossToday: 450,
    };
    const s = hydratePersistedState(
      JSON.stringify(payload),
      new Date('2026-08-05T02:00:00Z'),
    );
    expect(s.tradingDayTz).toBe('America/New_York');
    expect(s.realizedLossToday).toBe(450);
  });

  it('a device timezone change does NOT delay the reset: once the pinned zone rolls over, the loss resets', () => {
    // 2026-08-05T05:00Z is Aug 5, 1am in New York — new trading day there,
    // regardless of what zone the device now reports.
    const payload: PersistedState = {
      ...valid,
      tradingDayTz: 'America/New_York',
      day: '2026-08-04',
      realizedLossToday: 450,
    };
    const s = hydratePersistedState(
      JSON.stringify(payload),
      new Date('2026-08-05T05:00:00Z'),
    );
    expect(s.realizedLossToday).toBe(0);
  });

  it('falls back to the device timezone for older payloads without tradingDayTz or with an invalid zone', () => {
    const { tradingDayTz: _omit, ...legacy } = valid;
    expect(
      hydratePersistedState(JSON.stringify(legacy), NOW).tradingDayTz,
    ).toBe(deviceTimeZone());
    expect(
      hydratePersistedState(
        JSON.stringify({ ...valid, tradingDayTz: 'Not/AZone' }),
        NOW,
      ).tradingDayTz,
    ).toBe(deviceTimeZone());
  });
});

describe('dayKeyInZone', () => {
  it('formats the calendar date of the given zone as YYYY-MM-DD', () => {
    const t = new Date('2026-08-05T02:00:00Z');
    expect(dayKeyInZone('UTC', t)).toBe('2026-08-05');
    expect(dayKeyInZone('America/New_York', t)).toBe('2026-08-04'); // 10pm Aug 4
    expect(dayKeyInZone('Asia/Tokyo', t)).toBe('2026-08-05'); // 11am Aug 5
  });

  it('falls back to the device-local date for an unformattable zone', () => {
    const t = new Date('2026-08-05T02:00:00Z');
    expect(dayKeyInZone('Not/AZone', t)).toBe(localDayKey(t));
  });
});

describe('isValidTimeZone / deviceTimeZone', () => {
  it('accepts real IANA zones and rejects junk', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('deviceTimeZone returns a formattable zone', () => {
    expect(isValidTimeZone(deviceTimeZone())).toBe(true);
  });
});

describe('localDayKey', () => {
  it('formats the local calendar date as YYYY-MM-DD', () => {
    // Local-time constructor: components below are the LOCAL date regardless
    // of the timezone the test runs in.
    expect(localDayKey(new Date(2026, 7, 4, 23, 59, 59))).toBe('2026-08-04');
    expect(localDayKey(new Date(2026, 0, 5, 0, 0, 1))).toBe('2026-01-05');
  });

  it('reports the LOCAL date even when it differs from the UTC date', () => {
    // Just before local midnight: in any zone ahead of UTC by >30 minutes
    // the UTC date is still the previous day; behind UTC it may already be
    // the next day. localDayKey must always report the local date.
    const d = new Date(2026, 7, 4, 23, 30, 0);
    expect(localDayKey(d)).toBe('2026-08-04');
    const offsetMin = -d.getTimezoneOffset(); // minutes ahead of UTC
    const utcKey = d.toISOString().slice(0, 10);
    if (offsetMin > 30) expect(utcKey).toBe('2026-08-04'); // UTC still 04
    if (offsetMin < -30) expect(utcKey).toBe('2026-08-05'); // UTC already 05
  });
});

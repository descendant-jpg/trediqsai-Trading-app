import { describe, expect, it } from 'vitest';
import { hydratePersistedState, type PersistedState } from '../persistedState';
import { STARTING_BALANCE } from '../tradingLogic';

const TODAY = '2026-08-04';

const valid: PersistedState = {
  balance: 101_250.5,
  realizedLossToday: 320,
  day: TODAY,
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
  position: null,
  history: [],
  lastPrice: null,
};

describe('hydratePersistedState — valid payload', () => {
  it('restores every field from a well-formed same-day payload', () => {
    const s = hydratePersistedState(JSON.stringify(valid), TODAY);
    expect(s).toEqual({
      balance: valid.balance,
      realizedLossToday: valid.realizedLossToday,
      position: valid.position,
      history: valid.history,
      lastPrice: valid.lastPrice,
    });
  });
});

describe('hydratePersistedState — missing / no payload', () => {
  it('returns fresh defaults when nothing was stored', () => {
    expect(hydratePersistedState(null, TODAY)).toEqual(fresh);
    expect(hydratePersistedState(undefined, TODAY)).toEqual(fresh);
    expect(hydratePersistedState('', TODAY)).toEqual(fresh);
  });
});

describe('hydratePersistedState — corrupt JSON', () => {
  it('falls back to defaults on unparseable data', () => {
    expect(hydratePersistedState('{not json', TODAY)).toEqual(fresh);
  });

  it('falls back to defaults on non-object JSON', () => {
    expect(hydratePersistedState('42', TODAY)).toEqual(fresh);
    expect(hydratePersistedState('"hi"', TODAY)).toEqual(fresh);
    expect(hydratePersistedState('[1,2]', TODAY)).toEqual(fresh);
    expect(hydratePersistedState('null', TODAY)).toEqual(fresh);
  });
});

describe('hydratePersistedState — missing or invalid fields', () => {
  it('defaults each missing field individually (older shape)', () => {
    const s = hydratePersistedState(
      JSON.stringify({ balance: 99_000, day: TODAY, realizedLossToday: 50 }),
      TODAY,
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
        lastPrice: NaN,
      }),
      TODAY,
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
      TODAY,
    );
    expect(s.position).toBeNull();
    expect(s.history).toEqual(valid.history);
  });

  it('ignores extra unknown fields', () => {
    const s = hydratePersistedState(
      JSON.stringify({ ...valid, futureField: { a: 1 }, version: 9 }),
      TODAY,
    );
    expect(s.balance).toBe(valid.balance);
    expect(s).not.toHaveProperty('futureField');
  });
});

describe('hydratePersistedState — daily loss reset', () => {
  it('keeps realizedLossToday on the same day', () => {
    const s = hydratePersistedState(JSON.stringify(valid), TODAY);
    expect(s.realizedLossToday).toBe(320);
  });

  it('resets realizedLossToday on a new day but keeps everything else', () => {
    const s = hydratePersistedState(JSON.stringify(valid), '2026-08-05');
    expect(s.realizedLossToday).toBe(0);
    expect(s.balance).toBe(valid.balance);
    expect(s.position).toEqual(valid.position);
    expect(s.history).toEqual(valid.history);
  });

  it('resets when the persisted day is missing or not a string', () => {
    expect(
      hydratePersistedState(
        JSON.stringify({ ...valid, day: undefined }),
        TODAY,
      ).realizedLossToday,
    ).toBe(0);
    expect(
      hydratePersistedState(JSON.stringify({ ...valid, day: 123 }), TODAY)
        .realizedLossToday,
    ).toBe(0);
  });
});

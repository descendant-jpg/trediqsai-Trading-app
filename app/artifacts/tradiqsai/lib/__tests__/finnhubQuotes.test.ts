import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFinnhubQuotes, mapFinnhubQuote } from '../finnhubQuotes';

/** Canonical Finnhub /quote response shape. */
const FINNHUB_RESPONSE = { c: 231.45, pc: 228.9, dp: 1.11 };

function mockFinnhub(payloads: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const symbol = new URL(String(input)).searchParams.get('symbol') ?? '';
      return {
        ok: true,
        status: 200,
        json: async () => payloads[symbol] ?? {},
      } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapFinnhubQuote', () => {
  it('extracts the current price (c) and percent change (dp)', () => {
    expect(mapFinnhubQuote('AAPL', FINNHUB_RESPONSE)).toEqual({
      symbol: 'AAPL',
      price: 231.45,
      changePercent: 1.11,
    });
  });

  it('formats mapped values to two decimals without crashing', () => {
    const quote = mapFinnhubQuote('AAPL', FINNHUB_RESPONSE);
    expect(quote?.price.toFixed(2)).toBe('231.45');
    expect(quote?.changePercent.toFixed(2)).toBe('1.11');
  });

  it('falls back to previous close when the current price is missing or zero', () => {
    expect(mapFinnhubQuote('MSFT', { pc: 415.2, dp: -0.5 })?.price).toBe(415.2);
    expect(mapFinnhubQuote('MSFT', { c: 0, pc: 415.2 })?.price).toBe(415.2);
  });

  it('defaults percent change to 0 when missing, null, or NaN', () => {
    expect(mapFinnhubQuote('MSFT', { c: 100 })?.changePercent).toBe(0);
    expect(mapFinnhubQuote('MSFT', { c: 100, dp: null })?.changePercent).toBe(0);
    expect(mapFinnhubQuote('MSFT', { c: 100, dp: Number.NaN })?.changePercent).toBe(0);
  });

  it('drops symbols with no usable price', () => {
    expect(mapFinnhubQuote('ZZZ', {})).toBeNull();
    expect(mapFinnhubQuote('ZZZ', { c: 0 })).toBeNull();
    expect(mapFinnhubQuote('ZZZ', { c: Number.NaN, pc: Number.NaN })).toBeNull();
  });

  it('never throws on malformed payloads', () => {
    for (const bad of [null, undefined, 42, 'oops', [], { c: 'high' }]) {
      expect(() => mapFinnhubQuote('BAD', bad as never)).not.toThrow();
    }
  });
});

describe('fetchFinnhubQuotes', () => {
  it('maps mocked Finnhub responses for every symbol', async () => {
    mockFinnhub({ AAPL: FINNHUB_RESPONSE, MSFT: { c: 415.2, dp: -0.25 } });
    const quotes = await fetchFinnhubQuotes(['AAPL', 'MSFT'], 'test-key');
    expect(quotes).toEqual([
      { symbol: 'AAPL', price: 231.45, changePercent: 1.11 },
      { symbol: 'MSFT', price: 415.2, changePercent: -0.25 },
    ]);
  });

  it('keeps running when individual symbols return malformed payloads', async () => {
    mockFinnhub({ AAPL: FINNHUB_RESPONSE, MSFT: null, NVDA: { c: 0 } });
    const quotes = await fetchFinnhubQuotes(['AAPL', 'MSFT', 'NVDA'], 'test-key');
    expect(quotes.map((q) => q.symbol)).toEqual(['AAPL']);
    expect(quotes[0].price.toFixed(2)).toBe('231.45');
  });

  it('throws when Finnhub returns no usable quotes', async () => {
    mockFinnhub({ AAPL: {} });
    await expect(fetchFinnhubQuotes(['AAPL'], 'test-key')).rejects.toThrow(
      'no usable quotes',
    );
  });

  it('throws on API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({ ok: false, status: 429, json: async () => ({}) }) as Response,
      ),
    );
    await expect(fetchFinnhubQuotes(['AAPL'], 'test-key')).rejects.toThrow(
      'Finnhub API Error: 429',
    );
  });
});

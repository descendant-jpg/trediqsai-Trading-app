import { describe, expect, it } from 'vitest';
import { FEEDS, parseFrame } from '../marketFeeds';

const binance = FEEDS[0];
const coinbase = FEEDS[1];

describe('feed configuration', () => {
  it('tries Binance first, then fails over to Coinbase', () => {
    expect(binance.url).toContain('binance');
    expect(coinbase.url).toContain('coinbase');
  });

  it('Binance needs no subscribe message; Coinbase subscribes to BTC-USD ticker', () => {
    expect(binance.subscribe).toBeUndefined();
    const sub = JSON.parse(coinbase.subscribe!);
    expect(sub).toEqual({
      type: 'subscribe',
      product_ids: ['BTC-USD'],
      channels: ['ticker'],
    });
  });
});

describe('parseFrame — Binance', () => {
  it('extracts the trade price from p', () => {
    expect(parseFrame(binance, JSON.stringify({ p: '64250.10' }))).toBe(
      64250.1,
    );
  });

  it('returns null for frames without a price', () => {
    expect(parseFrame(binance, JSON.stringify({ e: 'ping' }))).toBeNull();
    expect(parseFrame(binance, JSON.stringify({ p: null }))).toBeNull();
  });

  it('returns null for non-numeric prices', () => {
    expect(parseFrame(binance, JSON.stringify({ p: 'not-a-number' }))).toBeNull();
  });
});

describe('parseFrame — Coinbase', () => {
  it('extracts the price from ticker messages', () => {
    expect(
      parseFrame(
        coinbase,
        JSON.stringify({ type: 'ticker', price: '64251.55' }),
      ),
    ).toBe(64251.55);
  });

  it('ignores non-ticker messages even if they carry a price', () => {
    expect(
      parseFrame(
        coinbase,
        JSON.stringify({ type: 'subscriptions', price: '1' }),
      ),
    ).toBeNull();
  });

  it('ignores ticker messages without a price', () => {
    expect(parseFrame(coinbase, JSON.stringify({ type: 'ticker' }))).toBeNull();
  });
});

describe('parseFrame — malformed input', () => {
  it('returns null for invalid JSON instead of throwing', () => {
    expect(parseFrame(binance, 'not json{{')).toBeNull();
    expect(parseFrame(coinbase, '')).toBeNull();
  });

  it('returns null for non-object JSON payloads', () => {
    expect(parseFrame(binance, '42')).toBeNull();
    expect(parseFrame(binance, 'null')).toBeNull();
  });
});

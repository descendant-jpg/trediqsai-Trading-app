/**
 * Public BTC/USD(T) trade streams, tried in order. Binance can be
 * geo-blocked (HTTP 451) in some regions/datacenters, so we fail over to
 * Coinbase's public feed (which needs a subscribe message).
 *
 * Pure (no React) so the frame parsers can be unit tested.
 */

export type Feed = {
  url: string;
  subscribe?: string;
  parse: (msg: any) => number | null;
};

export const FEEDS: Feed[] = [
  {
    url: 'wss://stream.binance.com:9443/ws/btcusdt@trade',
    parse: (msg) => (msg?.p != null ? parseFloat(msg.p) : null),
  },
  {
    url: 'wss://ws-feed.exchange.coinbase.com',
    subscribe: JSON.stringify({
      type: 'subscribe',
      product_ids: ['BTC-USD'],
      channels: ['ticker'],
    }),
    parse: (msg) =>
      msg?.type === 'ticker' && msg?.price != null
        ? parseFloat(msg.price)
        : null,
  },
];

/**
 * Parse a raw WebSocket frame with a feed's parser. Returns a finite price
 * or null for malformed JSON, unrelated messages, or non-finite values.
 */
export function parseFrame(feed: Feed, raw: string): number | null {
  try {
    const price = feed.parse(JSON.parse(raw));
    if (price == null || !Number.isFinite(price)) return null;
    return price;
  } catch {
    return null;
  }
}

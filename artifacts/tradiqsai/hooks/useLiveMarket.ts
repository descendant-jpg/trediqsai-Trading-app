import { useEffect, useRef, useState } from 'react';

export type LivePoint = { timestamp: number; value: number };

/**
 * Public BTC/USD(T) trade streams, tried in order. Binance can be
 * geo-blocked (HTTP 451) in some regions/datacenters, so we fail over to
 * Coinbase's public feed (which needs a subscribe message).
 */
const FEEDS: {
  url: string;
  subscribe?: string;
  parse: (msg: any) => number | null;
}[] = [
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

/** Minimum ms between state updates — trade streams can emit many messages
 * per second; throttling keeps re-renders (and the chart) smooth. */
const UPDATE_INTERVAL_MS = 300;
const MAX_POINTS = 50;

/**
 * Live BTC market feed over WebSocket (public streams — no API key).
 * Maintains the latest price, a rolling 50-point chart series, and a
 * heartbeat counter that increments on every applied update (drives the
 * pulsing indicator dot).
 */
export function useLiveMarket() {
  const [livePrice, setLivePrice] = useState(0);
  const [chartData, setChartData] = useState<LivePoint[]>([]);
  const [heartbeat, setHeartbeat] = useState(0);
  const [connected, setConnected] = useState(false);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let feedIndex = 0;
    let gotData = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    const connect = () => {
      if (closed) return;
      const feed = FEEDS[feedIndex % FEEDS.length];
      ws = new WebSocket(feed.url);

      ws.onopen = () => {
        if (closed) return;
        console.log('Connected to Live Market');
        setConnected(true);
        if (feed.subscribe) ws?.send(feed.subscribe);
      };

      ws.onmessage = (event) => {
        if (closed) return;
        try {
          const price = feed.parse(JSON.parse(event.data as string));
          if (price == null || !Number.isFinite(price)) return;
          gotData = true;

          const now = Date.now();
          if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
          lastUpdateRef.current = now;

          setLivePrice(price);
          setChartData((prev) => [
            ...prev.slice(-(MAX_POINTS - 1)),
            { timestamp: now, value: price },
          ]);
          setHeartbeat((h) => h + 1);
        } catch {
          // Ignore malformed frames.
        }
      };

      let handled = false;
      const failover = () => {
        if (closed || handled) return;
        handled = true;
        setConnected(false);
        if (!gotData) {
          // Feed never produced data (e.g. geo-blocked) — try the next
          // immediately.
          feedIndex += 1;
          connect();
        } else {
          // Transient drop after a working connection — reconnect to the
          // same feed with exponential backoff (capped at 15s).
          gotData = false;
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 15_000);
        }
      };
      ws.onerror = failover;
      ws.onclose = failover;
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { livePrice, chartData, heartbeat, connected };
}

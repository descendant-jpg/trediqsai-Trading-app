import { describe, expect, it, vi } from "vitest";
import {
  acquirePublisherLease,
  runSignalCycle,
  CYCLE_DEADLINE_MS,
  PUBLISHER_LEASE_WINDOW_MS,
  SIGNAL_PUBLISH_INTERVAL_MS,
} from "./signalPublisher";

process.env["SUPABASE_URL"] = "https://stub.supabase.co";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "stub-service-key";

const OPEN_ROW = {
  id: "sig-live",
  pair: "BTC/USD",
  asset_class: "crypto",
  action: "BUY",
  status: "Active",
  risk_reward: 3.2,
  entry: 100,
  stop_loss: 90,
  take_profits: {
    version: 2,
    targets: [
      { id: 1, price: 110, pips: 1000, label: "+10.0%", isHit: false, hitAt: null },
      { id: 2, price: 120, pips: 2000, label: "+20.0%", isHit: false, hitAt: null },
      { id: 3, price: 132, pips: 3200, label: "+32.0%", isHit: false, hitAt: null },
    ],
    analysis: "Momentum aligned.",
    confidence: 80,
    risk: "Low",
    timeframe: "H1",
    rr: "1:3.2",
    breakeven: false,
    openedAt: "2026-08-25T08:00:00Z",
    closedAt: null,
  },
  pips: 0,
  timestamp: "2026-08-25T08:00:00Z",
};

/** 68 bars: flat, dip, then a sharp rally — a fresh bullish EMA cross. */
function trendingCloses(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 55; i++) closes.push(100);
  for (let i = 0; i < 5; i++) closes.push(100 - (i + 1) * 0.3);
  for (let i = 0; i < 8; i++) closes.push(98.5 + (i + 1) * 1.5);
  return closes;
}

/** Coinbase candle rows: [time, low, high, open, close, volume], newest first. */
function coinbaseCandleRows(intervalSec: number) {
  const closes = trendingCloses();
  const end = Math.floor(Date.now() / 1000);
  return closes
    .map((c, i) => [end - (closes.length - 1 - i) * intervalSec, c - 0.5, c + 0.5, c, c, 1])
    .reverse();
}

function finnhubCandleBody(intervalSec: number) {
  const closes = trendingCloses();
  const end = Math.floor(Date.now() / 1000);
  return {
    s: "ok",
    c: closes,
    h: closes.map((c) => c + 0.5),
    l: closes.map((c) => c - 0.5),
    t: closes.map((_, i) => end - (closes.length - 1 - i) * intervalSec),
  };
}

const fakeChart = async (_symbol: string, options: { interval: "15m" | "1h" }) => {
  const closes = trendingCloses();
  const end = Date.now();
  const intervalMs = options.interval === "15m" ? 900_000 : 3_600_000;
  return {
    quotes: closes.map((close, i) => ({
      date: new Date(end - (closes.length - 1 - i) * intervalMs),
      high: close + 0.5,
      low: close - 0.5,
      close,
    })),
  };
};

type FakeOptions = {
  leaseCount?: number;
  openRows?: unknown[];
  /** Rows returned by the conditional PATCH (empty = lost the race). */
  patchMatched?: boolean;
};

function fakeFetch(opts: FakeOptions = {}) {
  const calls = { patch: 0, insert: 0, selectSignals: 0, lease: 0, patchUrls: [] as string[] };
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.includes("/rpc/rate_limit_consume")) {
      calls.lease += 1;
      return new Response(JSON.stringify(opts.leaseCount ?? 1), { status: 200 });
    }
    if (url.includes("api.exchange.coinbase.com")) {
      const intervalSec = url.includes("granularity=3600") ? 3600 : 900;
      return new Response(JSON.stringify(coinbaseCandleRows(intervalSec)), { status: 200 });
    }
    if (url.includes("api.coinbase.com")) {
      return new Response(JSON.stringify({ data: { amount: "115" } }), { status: 200 });
    }
    if (url.includes("/stock/candle")) {
      const intervalSec = url.includes("resolution=60") ? 3600 : 900;
      return new Response(JSON.stringify(finnhubCandleBody(intervalSec)), { status: 200 });
    }
    if (url.includes("finnhub.io")) {
      return new Response(JSON.stringify({ c: 150 }), { status: 200 });
    }
    if (url.includes("/rest/v1/tradiqs_signals")) {
      if (init?.method === "PATCH") {
        calls.patch += 1;
        calls.patchUrls.push(url);
        return new Response(JSON.stringify(opts.patchMatched === false ? [] : [{ id: "sig-live" }]), { status: 200 });
      }
      if (init?.method === "POST") {
        calls.insert += 1;
        return new Response(JSON.stringify([{ id: "sig-new" }]), { status: 201 });
      }
      calls.selectSignals += 1;
      // The cycle selects open rows twice (advance + recount); keep it simple.
      return new Response(JSON.stringify(opts.openRows ?? []), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const silentNotify = vi.fn(
  async (
    _title: string,
    _body: string,
    _data: Record<string, unknown>,
    _fetchImpl?: typeof fetch,
    _deadline?: AbortSignal,
  ) => {},
);
const rationale = vi.fn(async () => "Seeded rationale.");
const now = () => new Date("2026-08-25T12:00:00Z");

describe("publisher lease invariants", () => {
  it("lease window is shorter than the interval (90s cadence preserved)", () => {
    // A fixed-window counter lease grants once per window; a window longer
    // than the interval would silently halve the publishing cadence.
    expect(PUBLISHER_LEASE_WINDOW_MS).toBeLessThan(SIGNAL_PUBLISH_INTERVAL_MS);
  });

  it("cycle deadline is shorter than the lease window (no outliving holder)", () => {
    expect(CYCLE_DEADLINE_MS).toBeLessThan(PUBLISHER_LEASE_WINDOW_MS);
  });

  it("aborts top-up creation once the absolute cycle deadline fires", async () => {
    silentNotify.mockClear();
    rationale.mockClear();
    const { fetchImpl, calls } = fakeFetch({ openRows: [] });
    await runSignalCycle({
      fetchImpl,
      now,
      notify: silentNotify,
      rationale,
      yahooChart: fakeChart,
      signal: AbortSignal.abort(),
    });
    expect(calls.insert).toBe(0);
    expect(rationale).not.toHaveBeenCalled();
  });

  it("aborts lifecycle transitions once the absolute cycle deadline fires", async () => {
    silentNotify.mockClear();
    const { fetchImpl, calls } = fakeFetch({ openRows: [OPEN_ROW], patchMatched: true });
    await runSignalCycle({
      fetchImpl,
      now,
      notify: silentNotify,
      rationale,
      yahooChart: fakeChart,
      signal: AbortSignal.abort(),
    });
    // The transition loop exits before any CAS write or notification.
    expect(calls.patch).toBe(0);
    const lifecycle = silentNotify.mock.calls.filter(
      ([title]) => typeof title === "string" && (title.includes("TP") || title.includes("closed") || title.includes("Won")),
    );
    expect(lifecycle).toEqual([]);
  });
});

describe("acquirePublisherLease", () => {
  it("grants the cycle only to the first consumer in the window", async () => {
    const winner = fakeFetch({ leaseCount: 1 });
    expect(await acquirePublisherLease(winner.fetchImpl)).toBe(true);
    const loser = fakeFetch({ leaseCount: 2 });
    expect(await acquirePublisherLease(loser.fetchImpl)).toBe(false);
  });

  it("returns null when the counter store is unreachable", async () => {
    const down = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await acquirePublisherLease(down)).toBeNull();
  });
});

describe("runSignalCycle mutual exclusion", () => {
  it("skips the entire cycle when another instance holds the lease", async () => {
    const { fetchImpl, calls } = fakeFetch({ leaseCount: 2 });
    await runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart });
    expect(calls.selectSignals).toBe(0);
    expect(calls.insert).toBe(0);
  });

  it("acquires the in-process guard synchronously — overlapping calls run once", async () => {
    const { fetchImpl, calls } = fakeFetch({ openRows: [] });
    await Promise.all([
      runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart }),
      runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart }),
    ]);
    // The second call hit the guard before its first await: one lease
    // consume, one cycle's worth of selects.
    expect(calls.lease).toBe(1);
    expect(calls.selectSignals).toBe(2);
  });

  it("pins the CAS predicate to the exact envelope that was read", async () => {
    silentNotify.mockClear();
    const { fetchImpl, calls } = fakeFetch({ openRows: [OPEN_ROW], patchMatched: true });
    await runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart });
    expect(calls.patch).toBe(1);
    const url = decodeURIComponent(calls.patchUrls[0]!);
    expect(url).toContain("status=in.(Active,Pending)");
    expect(url).toContain("take_profits=eq.");
    expect(url).toContain('"version":2');
  });

  it("suppresses lifecycle notifications when the conditional patch loses the race", async () => {
    silentNotify.mockClear();
    const { fetchImpl, calls } = fakeFetch({ openRows: [OPEN_ROW], patchMatched: false });
    await runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart });
    expect(calls.patch).toBe(1);
    // Row was already transitioned by a competing cycle: no duplicate TP/close
    // pushes (creation pushes for the thin desk are unrelated and allowed).
    const lifecycle = silentNotify.mock.calls.filter(
      ([title]) => typeof title === "string" && (title.includes("TP") || title.includes("closed") || title.includes("Won")),
    );
    expect(lifecycle).toEqual([]);
  });

  it("sends TP-hit notifications only when the conditional patch lands", async () => {
    silentNotify.mockClear();
    const { fetchImpl, calls } = fakeFetch({ openRows: [OPEN_ROW], patchMatched: true });
    await runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart });
    expect(calls.patch).toBe(1);
    expect(silentNotify).toHaveBeenCalledWith(
      "🎯 TP Hit",
      expect.stringContaining("BTC/USD"),
      { signal_id: "sig-live" },
      fetchImpl,
      expect.any(AbortSignal),
    );
  });

  it("creates new signals with a rationale and creation push when the desk is thin", async () => {
    silentNotify.mockClear();
    rationale.mockClear();
    const { fetchImpl, calls } = fakeFetch({ openRows: [] });
    await runSignalCycle({ fetchImpl, now, notify: silentNotify, rationale, yahooChart: fakeChart });
    expect(calls.insert).toBeGreaterThan(0);
    expect(rationale).toHaveBeenCalled();
    expect(silentNotify).toHaveBeenCalledWith(
      "🚨 New Signal",
      expect.any(String),
      { signal_id: "sig-new" },
      fetchImpl,
      expect.any(AbortSignal),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  SIGNAL_UNIVERSE,
  advanceSignal,
  buildTechnicalSetup,
  fetchCoinbaseCandles,
  fetchFinnhubCandles,
  fetchUniverseCandles,
  fetchYahooCandles,
  normalizeEnvelope,
  realizedPips,
  type CandleFeed,
  type CandleSeries,
  type SignalEnvelope,
} from "./signalEngine";

process.env["FINNHUB_API_KEY"] = "test-finnhub-key";

const BTC = SIGNAL_UNIVERSE.find((i) => i.symbol === "BTC/USD")!;
const GOLD = SIGNAL_UNIVERSE.find((i) => i.symbol === "XAU/USD")!;
const AAPL = SIGNAL_UNIVERSE.find((i) => i.symbol === "AAPL")!;

const M15_MS = 15 * 60_000;
const H1_MS = 60 * 60_000;

/** Times anchored at now so the freshness checks accept the fixture. */
function makeSeries(closes: number[], intervalMs: number, range = 1): CandleSeries {
  const end = Date.now();
  return {
    highs: closes.map((c) => c + range / 2),
    lows: closes.map((c) => c - range / 2),
    closes,
    times: closes.map((_, i) => end - (closes.length - 1 - i) * intervalMs),
  };
}

/**
 * M15 series with a FRESH bullish EMA cross: flat, a dip that pulls the fast
 * EMA below the slow, then a sharp rally that crosses it back within the
 * final bars.
 */
function bullishTrigger(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 55; i++) closes.push(100);
  for (let i = 0; i < 5; i++) closes.push(100 - (i + 1) * 0.3); // → 98.5
  for (let i = 0; i < 8; i++) closes.push(98.5 + (i + 1) * 1.5); // → 110.5
  return closes;
}

function bearishTrigger(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 55; i++) closes.push(100);
  for (let i = 0; i < 5; i++) closes.push(100 + (i + 1) * 0.3); // → 101.5
  for (let i = 0; i < 8; i++) closes.push(101.5 - (i + 1) * 1.5); // → 89.5
  return closes;
}

/** Macro H1 series with a steady uptrend (close above H1 EMA50). */
function macroUp(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 80; i++) closes.push(90 + i * 0.25);
  return closes;
}

function macroDown(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 80; i++) closes.push(110 - i * 0.25);
  return closes;
}

/** Cross happened long ago, then price went flat — a stale trigger. */
function staleTrigger(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 40; i++) closes.push(100);
  for (let i = 0; i < 5; i++) closes.push(100 - (i + 1) * 0.3);
  for (let i = 0; i < 10; i++) closes.push(98.5 + (i + 1) * 1.5);
  for (let i = 0; i < 15; i++) closes.push(113.5);
  return closes;
}

const feedFor = (m15: number[], h1: number[]): CandleFeed => ({
  m15: makeSeries(m15, M15_MS),
  h1: makeSeries(h1, H1_MS),
});

describe("buildTechnicalSetup", () => {
  it("emits a BUY with ATR-scaled SL/TPs when M15 cross aligns with the H1 trend", () => {
    const parts = buildTechnicalSetup(BTC, 114, feedFor(bullishTrigger(), macroUp()));
    expect(parts).not.toBeNull();
    expect(parts!.direction).toBe("BUY");
    expect(parts!.status).toBe("Active");
    expect(parts!.entry).toBe(114);
    const slDistance = parts!.entry - parts!.stopLoss;
    expect(slDistance).toBeGreaterThan(0);
    // TP distances must scale 1x / 2x / 3x of the SL distance (1.5x ATR each).
    const tpDistances = parts!.targets.map((tp) => tp.price - parts!.entry);
    expect(tpDistances[0]).toBeCloseTo(slDistance, 6);
    expect(tpDistances[1]).toBeCloseTo(slDistance * 2, 6);
    expect(tpDistances[2]).toBeCloseTo(slDistance * 3, 6);
    expect(parts!.timeframe).toBe("M15/H1");
    expect(parts!.rr).toBe("1:3");
    expect(parts!.confidence).toBeGreaterThanOrEqual(60);
    expect(parts!.confidence).toBeLessThanOrEqual(92);
  });

  it("emits a mirrored SELL on a bearish cross in a macro downtrend", () => {
    const parts = buildTechnicalSetup(GOLD, 86, feedFor(bearishTrigger(), macroDown()));
    expect(parts).not.toBeNull();
    expect(parts!.direction).toBe("SELL");
    expect(parts!.stopLoss).toBeGreaterThan(parts!.entry);
    expect(parts!.targets.map((t) => t.price)).toEqual(
      [...parts!.targets.map((t) => t.price)].sort((a, b) => b - a),
    );
    expect(parts!.targets[0]!.label).toMatch(/^\+\d+p$/); // forex pip labels
  });

  it("refuses the setup when the timeframes conflict", () => {
    expect(buildTechnicalSetup(BTC, 114, feedFor(bullishTrigger(), macroDown()))).toBeNull();
  });

  it("refuses stale triggers where the cross is older than the lookback", () => {
    expect(buildTechnicalSetup(BTC, 113.5, feedFor(staleTrigger(), macroUp()))).toBeNull();
  });

  it("refuses instruments with insufficient live history", () => {
    const thin = feedFor(bullishTrigger().slice(0, 30), macroUp());
    expect(buildTechnicalSetup(BTC, 114, thin)).toBeNull();
  });

  it("refuses invalid spot prices instead of fabricating a setup", () => {
    const feed = feedFor(bullishTrigger(), macroUp());
    expect(buildTechnicalSetup(BTC, 0, feed)).toBeNull();
    expect(buildTechnicalSetup(BTC, Number.NaN, feed)).toBeNull();
  });

  it("refuses stale history — a delayed feed must never look like a live trigger", () => {
    const stale: CandleFeed = {
      m15: {
        ...makeSeries(bullishTrigger(), M15_MS),
        // Last M15 bar closed two hours ago (e.g. a cached provider response).
        times: bullishTrigger().map((_, i) => Date.now() - 2 * 3_600_000 - (bullishTrigger().length - 1 - i) * M15_MS),
      },
      h1: makeSeries(macroUp(), H1_MS),
    };
    expect(buildTechnicalSetup(BTC, 114, stale)).toBeNull();
  });

  it("refuses off-cadence history (M15-shaped bars arriving hours apart)", () => {
    const wrongCadence: CandleFeed = {
      m15: makeSeries(bullishTrigger(), H1_MS), // hourly gaps on a "15m" feed
      h1: makeSeries(macroUp(), H1_MS),
    };
    expect(buildTechnicalSetup(BTC, 114, wrongCadence)).toBeNull();
  });

  it("refuses setups whose rounded levels collapse onto the entry", () => {
    const tinyInstrument = {
      ...AAPL,
      symbol: "TINY",
      decimals: 0, // whole-dollar quoting; ATR of ~1 cent collapses the SL
    };
    const feed: CandleFeed = {
      m15: makeSeries(bullishTrigger().map((c) => c / 100), M15_MS, 0.002),
      h1: makeSeries(macroUp().map((c) => c / 100), H1_MS, 0.002),
    };
    expect(buildTechnicalSetup(tinyInstrument, 1, feed)).toBeNull();
  });

  it("labels targets per asset class", () => {
    const crypto = buildTechnicalSetup(BTC, 114, feedFor(bullishTrigger(), macroUp()))!;
    expect(crypto.targets[0]!.label).toMatch(/^\+\d+\.\d%$/);
    const stock = buildTechnicalSetup(AAPL, 114, feedFor(bullishTrigger(), macroUp()))!;
    expect(stock.targets[0]!.label).toMatch(/^\+\$\d+\.\d{2}$/);
  });
});

describe("candle fetchers (live feeds only)", () => {
  it("parses Coinbase candles and sorts them oldest-first", async () => {
    const closes = bullishTrigger();
    const rows = closes
      .map((close, i) => [1_700_000_000 + i * 900, close - 0.5, close + 0.5, close, close, 12])
      .reverse(); // Coinbase returns newest first
    const fetchImpl = (async () => new Response(JSON.stringify(rows))) as typeof fetch;
    const series = await fetchCoinbaseCandles("BTC-USD", 900, fetchImpl);
    expect(series!.closes[0]).toBe(100);
    expect(series!.closes.at(-1)).toBe(110.5);
    expect(series!.times[0]!).toBeLessThan(series!.times.at(-1)!);
  });

  it("throws on Finnhub no_data so the caller can fall back", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ s: "no_data" }))) as typeof fetch;
    await expect(fetchFinnhubCandles("AAPL", "15", "key", fetchImpl)).rejects.toThrow();
  });

  it("parses Yahoo chart quotes through the injected chart function", async () => {
    const closes = bullishTrigger();
    const end = Date.now();
    const chart = async () => ({
      quotes: closes.map((close, i) => ({
        date: new Date(end - (closes.length - 1 - i) * 900_000),
        open: close,
        high: close + 0.5,
        low: close - 0.5,
        close,
      })),
    });
    const series = await fetchYahooCandles("EURUSD=X", "15m", chart);
    expect(series!.closes.at(-1)).toBe(110.5);
  });

  it("rejects a never-settling Yahoo request once the cycle deadline fires", async () => {
    const hanging = () => new Promise<never>(() => {});
    await expect(
      fetchYahooCandles("EURUSD=X", "15m", hanging, AbortSignal.abort()),
    ).rejects.toThrow("cycle deadline");
  });

  it("falls back to Yahoo when the primary candle provider fails", async () => {
    // BTC primary is Coinbase; make it fail and expect the Yahoo fallback.
    const fetchImpl = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const closes = bullishTrigger();
    const chart = async () => ({
      quotes: closes.map((close, i) => ({ date: new Date(i * 60_000), high: close + 0.5, low: close - 0.5, close })),
    });
    const feeds = await fetchUniverseCandles(fetchImpl, "key", undefined, chart);
    // Every instrument resolved through the fallback chart.
    expect(feeds.get("BTC/USD")?.m15.closes.at(-1)).toBe(110.5);
    expect(feeds.has("EUR/USD")).toBe(true);
  });

  it("omits instruments entirely when every live feed is down", async () => {
    const fetchImpl = (async () => new Response("down", { status: 500 })) as typeof fetch;
    const deadChart = async () => {
      throw new Error("yahoo down");
    };
    const feeds = await fetchUniverseCandles(fetchImpl, "key", undefined, deadChart);
    expect(feeds.size).toBe(0);
  });
});

describe("envelope + state machine (unchanged contract)", () => {
  const envelope = (targets: Partial<SignalEnvelope["targets"][number]>[]): SignalEnvelope => ({
    version: 2,
    targets: targets.map((t, i) => ({
      id: (i + 1) as 1 | 2 | 3,
      price: t.price ?? 0,
      pips: t.pips ?? 10,
      label: t.label ?? "",
      isHit: t.isHit ?? false,
      hitAt: t.hitAt ?? null,
    })),
    analysis: "",
    confidence: 80,
    risk: "Low",
    timeframe: "M15/H1",
    rr: "1:3",
    breakeven: false,
    openedAt: null,
    closedAt: null,
  });

  it("normalizes legacy array take_profits into the v2 envelope", () => {
    const env = normalizeEnvelope([{ price: 100, hit: true }, { price: 110 }]);
    expect(env.version).toBe(2);
    expect(env.targets[0]).toMatchObject({ id: 1, price: 100, isHit: true });
    expect(env.targets[1]).toMatchObject({ id: 2, price: 110, isHit: false });
  });

  it("keeps v2 envelopes intact", () => {
    const env = normalizeEnvelope(envelope([{ price: 5 }]), "fallback");
    expect(env.confidence).toBe(80);
    expect(env.rr).toBe("1:3");
  });

  it("hits TPs in order, arms break-even, and closes Won", () => {
    const state = {
      status: "Active" as const,
      direction: "BUY" as const,
      entry: 100,
      stopLoss: 95,
      envelope: envelope([{ price: 105 }, { price: 110 }, { price: 115 }]),
    };
    const first = advanceSignal(state, 106, new Date("2026-08-25T10:00:00Z"));
    expect(first.events.map((e) => e.type)).toEqual(["tp_hit", "breakeven"]);
    const second = advanceSignal(first.state, 116, new Date("2026-08-25T11:00:00Z"));
    expect(second.state.status).toBe("Won");
    expect(second.state.envelope.targets.every((t) => t.isHit)).toBe(true);
    expect(realizedPips(second.state.envelope)).toBe(30);
  });

  it("closes Lost when the untouched stop is hit", () => {
    const state = {
      status: "Active" as const,
      direction: "SELL" as const,
      entry: 100,
      stopLoss: 105,
      envelope: envelope([{ price: 95 }]),
    };
    const { state: next, events } = advanceSignal(state, 106);
    expect(next.status).toBe("Lost");
    expect(events.at(-1)).toEqual({ type: "closed", status: "Lost" });
  });
});

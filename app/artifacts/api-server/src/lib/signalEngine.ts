/**
 * Multi-asset signal engine — pure technical-analysis logic.
 *
 * Universe: Forex (EUR/USD, GBP/USD, XAU/USD, USOIL), Crypto (BTC/ETH/SOL
 * via Coinbase — Binance is geo-blocked from this infrastructure), and
 * Stocks (AAPL, NVDA, TSLA). Every setup is computed from LIVE candle data:
 * multi-timeframe EMA confluence (M15 trigger vs H1 trend) with ATR-scaled
 * stop/targets. If a live feed is unavailable or no setup validates, the
 * instrument is skipped — there is no dummy or simulated fallback anywhere.
 *
 * Everything here is deterministic given the same candles so tests can pin
 * behavior; the publisher owns all IO (and the absolute cycle deadline).
 */
import { ATR, EMA } from "technicalindicators";
import { withDeadline } from "./httpTimeout.js";

export type AssetCategory = "forex" | "crypto" | "stocks";
export type SignalDirection = "BUY" | "SELL";
export type SignalStatus = "Active" | "Won" | "Lost" | "Pending";

export interface Quote {
  symbol: string;
  price: number;
}

export interface Instrument {
  /** Display ticker, e.g. "XAU/USD". */
  symbol: string;
  category: AssetCategory;
  /** Spot-quote provider: "coinbase" (spot API) or "finnhub" (/quote). */
  provider: "coinbase" | "finnhub";
  providerSymbol: string;
  /** Primary candle history provider for technical analysis. */
  candles: "coinbase" | "finnhub" | "yahoo";
  /** Yahoo Finance chart symbol — fallback live feed for every instrument. */
  yahooSymbol: string;
  decimals: number;
  /** Forex pip size; null for crypto (%) and stocks ($). */
  pipSize: number | null;
}

export const SIGNAL_UNIVERSE: Instrument[] = [
  { symbol: "EUR/USD", category: "forex", provider: "finnhub", providerSymbol: "OANDA:EUR_USD", candles: "yahoo", yahooSymbol: "EURUSD=X", decimals: 5, pipSize: 0.0001 },
  { symbol: "GBP/USD", category: "forex", provider: "finnhub", providerSymbol: "OANDA:GBP_USD", candles: "yahoo", yahooSymbol: "GBPUSD=X", decimals: 5, pipSize: 0.0001 },
  { symbol: "XAU/USD", category: "forex", provider: "finnhub", providerSymbol: "OANDA:XAU_USD", candles: "yahoo", yahooSymbol: "GC=F", decimals: 2, pipSize: 0.1 },
  { symbol: "USOIL", category: "forex", provider: "finnhub", providerSymbol: "OANDA:WTICO_USD", candles: "yahoo", yahooSymbol: "CL=F", decimals: 2, pipSize: 0.01 },
  { symbol: "BTC/USD", category: "crypto", provider: "coinbase", providerSymbol: "BTC-USD", candles: "coinbase", yahooSymbol: "BTC-USD", decimals: 1, pipSize: null },
  { symbol: "ETH/USD", category: "crypto", provider: "coinbase", providerSymbol: "ETH-USD", candles: "coinbase", yahooSymbol: "ETH-USD", decimals: 2, pipSize: null },
  { symbol: "SOL/USD", category: "crypto", provider: "coinbase", providerSymbol: "SOL-USD", candles: "coinbase", yahooSymbol: "SOL-USD", decimals: 2, pipSize: null },
  { symbol: "AAPL", category: "stocks", provider: "finnhub", providerSymbol: "AAPL", candles: "finnhub", yahooSymbol: "AAPL", decimals: 2, pipSize: null },
  { symbol: "NVDA", category: "stocks", provider: "finnhub", providerSymbol: "NVDA", candles: "finnhub", yahooSymbol: "NVDA", decimals: 2, pipSize: null },
  { symbol: "TSLA", category: "stocks", provider: "finnhub", providerSymbol: "TSLA", candles: "finnhub", yahooSymbol: "TSLA", decimals: 2, pipSize: null },
];

export interface SignalTarget {
  id: 1 | 2 | 3;
  price: number;
  /** Realized distance in pips (forex), percent*100 (crypto) or cents (stocks). */
  pips: number;
  /** Display label: "+50p", "+4.5%", "+$12.50". */
  label: string;
  isHit: boolean;
  hitAt: string | null;
}

/**
 * Take-profit data and AI metadata ride inside the existing
 * `take_profits` jsonb column — the live table cannot gain columns without
 * the Supabase SQL editor, so this envelope is versioned instead.
 */
export interface SignalEnvelope {
  version: 2;
  targets: SignalTarget[];
  analysis: string;
  confidence: number;
  risk: "Low" | "Medium" | "High";
  timeframe: string;
  rr: string;
  breakeven: boolean;
  openedAt: string | null;
  closedAt: string | null;
}

const round = (value: number, decimals: number): number =>
  Number(value.toFixed(decimals));

function measureTarget(instrument: Instrument, entry: number, target: number): { pips: number; label: string } {
  const distance = Math.abs(target - entry);
  if (instrument.category === "forex" && instrument.pipSize) {
    const pips = Math.round(distance / instrument.pipSize);
    return { pips, label: `+${pips}p` };
  }
  if (instrument.category === "crypto") {
    const pct = (distance / entry) * 100;
    return { pips: Math.round(pct * 100), label: `+${pct.toFixed(1)}%` };
  }
  return { pips: Math.round(distance * 100), label: `+$${distance.toFixed(2)}` };
}

// --- Candle history (live feeds only; failures skip the instrument) ---

export interface CandleSeries {
  highs: number[];
  lows: number[];
  closes: number[];
  times: number[];
}

/** M15 trigger series + H1 macro series for one instrument. */
export interface CandleFeed {
  m15: CandleSeries;
  h1: CandleSeries;
}

/** technicalindicators needs enough bars before EMA50/ATR14 are meaningful. */
export const MIN_CANDLES = 60;

const M15_MS = 15 * 60_000;
const H1_MS = 60 * 60_000;
/** A series whose last bar is older than this many intervals is stale. */
const MAX_BAR_AGE_MULT = 3;

function seriesFromOhlc(
  candles: { high: number; low: number; close: number; time: number }[],
): CandleSeries | null {
  const clean = candles
    .filter(
      (c) =>
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        Number.isFinite(c.time) &&
        c.time > 0 &&
        c.close > 0,
    )
    .sort((a, b) => a.time - b.time)
    // Strictly increasing timestamps — duplicates break the cadence math.
    .filter((c, i, arr) => i === 0 || c.time > arr[i - 1]!.time);
  if (clean.length < MIN_CANDLES) return null;
  return {
    highs: clean.map((c) => c.high),
    lows: clean.map((c) => c.low),
    closes: clean.map((c) => c.close),
    times: clean.map((c) => c.time),
  };
}

/**
 * "Live" means the feed is both recent (last bar within 3 intervals of now)
 * and on-cadence (recent gaps match the timeframe — a delayed or cached
 * response must never make an old crossover look fresh). Markets that are
 * closed (stocks/forex on weekends) fail this check and are skipped.
 */
function isSeriesLive(series: CandleSeries, intervalMs: number, nowMs: number): boolean {
  const times = series.times;
  if (times.length < MIN_CANDLES) return false;
  const lastTime = times[times.length - 1]!;
  if (nowMs - lastTime > MAX_BAR_AGE_MULT * intervalMs) return false;
  const tail = times.slice(-6);
  for (let i = 1; i < tail.length; i += 1) {
    const gap = tail[i]! - tail[i - 1]!;
    if (gap < intervalMs * 0.4 || gap > intervalMs * 2.5) return false;
  }
  return true;
}

/** Coinbase Exchange public candles: rows [time, low, high, open, close, volume], newest first. */
export async function fetchCoinbaseCandles(
  product: string,
  granularity: 900 | 3600,
  fetchImpl: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<CandleSeries | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 300 * granularity * 1000);
  const url =
    `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles` +
    `?granularity=${granularity}&start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await fetchImpl(url, { signal: withDeadline(deadline, 8_000) });
  if (!res.ok) throw new Error(`Coinbase candles failed: ${res.status}`);
  const rows = (await res.json()) as [number, number, number, number, number, number][];
  if (!Array.isArray(rows)) throw new Error("Coinbase candles invalid");
  const candles = rows
    .map(([time, low, high, , close]) => ({ time: time * 1000, high, low, close }))
    .sort((a, b) => a.time - b.time);
  return seriesFromOhlc(candles);
}

/** Finnhub /stock/candle — free tier covers US stocks at intraday resolutions. */
export async function fetchFinnhubCandles(
  symbol: string,
  resolution: "15" | "60",
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<CandleSeries | null> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 300 * Number(resolution) * 60;
  const url =
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${resolution}&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { signal: withDeadline(deadline, 8_000) });
  if (!res.ok) throw new Error(`Finnhub candles failed: ${res.status}`);
  const json = (await res.json()) as {
    s?: string; h?: number[]; l?: number[]; c?: number[]; t?: number[];
  };
  if (json.s !== "ok" || !Array.isArray(json.c)) throw new Error("Finnhub candles unavailable");
  const candles = (json.c ?? []).map((close, i) => ({
    time: (json.t?.[i] ?? 0) * 1000,
    high: json.h?.[i] ?? close,
    low: json.l?.[i] ?? close,
    close,
  }));
  return seriesFromOhlc(candles);
}

export interface YahooChartQuote {
  date?: Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
}
export type YahooChart = (
  symbol: string,
  options: { period1: Date; period2: Date; interval: "15m" | "1h" },
) => Promise<{ quotes?: YahooChartQuote[] }>;

/**
 * Yahoo Finance v8 chart feed — live candles for forex/commodities and the
 * fallback provider for every instrument. The chart function is injectable
 * so tests never touch the network; the real publisher passes yahoo-finance2.
 * The cycle deadline still bounds the call even though the library owns its
 * own HTTP client.
 */
export async function fetchYahooCandles(
  yahooSymbol: string,
  interval: "15m" | "1h",
  chartImpl: YahooChart,
  deadline?: AbortSignal,
): Promise<CandleSeries | null> {
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - 7 * 24 * 60 * 60_000);
  const request = chartImpl(yahooSymbol, { period1, period2, interval });
  const result = deadline
    ? await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          if (deadline.aborted) reject(new Error("cycle deadline reached"));
          deadline.addEventListener("abort", () => reject(new Error("cycle deadline reached")), { once: true });
        }),
      ])
    : await request;
  const quotes = result?.quotes ?? [];
  const candles = quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => ({
      time: q.date instanceof Date ? q.date.getTime() : 0,
      high: q.high ?? q.close ?? 0,
      low: q.low ?? q.close ?? 0,
      close: q.close ?? 0,
    }));
  return seriesFromOhlc(candles);
}

async function fetchSeries(
  instrument: Instrument,
  timeframe: "m15" | "h1",
  ctx: {
    fetchImpl: typeof fetch;
    finnhubKey: string;
    yahooChart: YahooChart | null;
    deadline?: AbortSignal;
  },
): Promise<CandleSeries | null> {
  const { fetchImpl, finnhubKey, yahooChart, deadline } = ctx;
  try {
    if (instrument.candles === "coinbase") {
      return await fetchCoinbaseCandles(
        instrument.providerSymbol,
        timeframe === "m15" ? 900 : 3600,
        fetchImpl,
        deadline,
      );
    }
    if (instrument.candles === "finnhub" && finnhubKey) {
      return await fetchFinnhubCandles(
        instrument.providerSymbol,
        timeframe === "m15" ? "15" : "60",
        finnhubKey,
        fetchImpl,
        deadline,
      );
    }
    throw new Error("primary candle provider not configured");
  } catch {
    // Fallback live provider: Yahoo Finance. Never fabricate history.
    if (!yahooChart) return null;
    try {
      return await fetchYahooCandles(
        instrument.yahooSymbol,
        timeframe === "m15" ? "15m" : "1h",
        yahooChart,
        deadline,
      );
    } catch {
      return null;
    }
  }
}

/**
 * Best-effort live candle feeds for the whole universe. Any instrument whose
 * primary AND fallback feeds are unavailable is omitted — the publisher then
 * skips it cleanly rather than synthesizing a setup.
 */
export async function fetchUniverseCandles(
  fetchImpl: typeof fetch = fetch,
  finnhubKey: string = process.env["FINNHUB_API_KEY"] ?? "",
  deadline?: AbortSignal,
  yahooChart: YahooChart | null = null,
): Promise<Map<string, CandleFeed>> {
  const feeds = new Map<string, CandleFeed>();
  await Promise.all(
    SIGNAL_UNIVERSE.map(async (instrument) => {
      const ctx = { fetchImpl, finnhubKey, yahooChart, deadline };
      const [m15, h1] = await Promise.all([
        fetchSeries(instrument, "m15", ctx),
        fetchSeries(instrument, "h1", ctx),
      ]);
      if (m15 && h1) feeds.set(instrument.symbol, { m15, h1 });
    }),
  );
  return feeds;
}

// --- Technical trigger engine (pure: candles in, validated setup or null) ---

export interface SignalParts {
  direction: SignalDirection;
  status: SignalStatus;
  entry: number;
  stopLoss: number;
  targets: SignalTarget[];
  confidence: number;
  risk: "Low" | "Medium" | "High";
  timeframe: string;
  rr: string;
}

const EMA_FAST = 20;
const EMA_SLOW = 50;
const ATR_PERIOD = 14;
/** A fresh M15 crossover must have occurred within this many bars. */
const CROSSOVER_LOOKBACK = 6;
/** Stop = 1.5x ATR; TP1/2/3 = 1.5x / 3x / 4.5x ATR → R:R 1:3 at TP3. */
const SL_ATR = 1.5;
const TP_ATR = [1.5, 3, 4.5] as const;
export const TP_RISK_REWARD = 3;

const last = <T>(values: T[]): T | undefined => values[values.length - 1];

/** Index of the most recent fast/slow EMA cross, or -1 when none. */
function lastCrossoverIndex(closes: number[]): number {
  const fast = EMA.calculate({ period: EMA_FAST, values: closes });
  const slow = EMA.calculate({ period: EMA_SLOW, values: closes });
  // EMA(20) emits closes.length-19 values, EMA(50) closes.length-49: fast
  // index i and slow index i-shift both describe the same close bar.
  const shift = EMA_SLOW - EMA_FAST;
  for (let i = fast.length - 1; i > shift; i -= 1) {
    const prev = fast[i - 1]! - slow[i - 1 - shift]!;
    const curr = fast[i]! - slow[i - shift]!;
    if (prev === 0) continue;
    if ((prev < 0 && curr >= 0) || (prev > 0 && curr <= 0)) return EMA_FAST - 1 + i;
  }
  return -1;
}

/**
 * Multi-timeframe confluence: the M15 fast/slow EMA cross must align with
 * the H1 macro trend (close vs H1 EMA50), then SL/TP scale with live H1 ATR.
 * Returns null — never a setup — when history is missing, thin, or the
 * timeframes disagree.
 */
export function buildTechnicalSetup(
  instrument: Instrument,
  spotPrice: number,
  feed: CandleFeed,
  now: Date = new Date(),
): SignalParts | null {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) return null;
  const { m15, h1 } = feed;
  if (m15.closes.length < MIN_CANDLES || h1.closes.length < MIN_CANDLES) return null;
  // Reject delayed/cached history before any TA runs on it.
  const nowMs = now.getTime();
  if (!isSeriesLive(m15, M15_MS, nowMs) || !isSeriesLive(h1, H1_MS, nowMs)) return null;

  const fast = last(EMA.calculate({ period: EMA_FAST, values: m15.closes }));
  const slow = last(EMA.calculate({ period: EMA_SLOW, values: m15.closes }));
  const macroEma = last(EMA.calculate({ period: EMA_SLOW, values: h1.closes }));
  const macroFast = last(EMA.calculate({ period: EMA_FAST, values: h1.closes }));
  const macroClose = last(h1.closes);
  if (!fast || !slow || !macroEma || !macroFast || !macroClose) return null;

  const triggerDir: SignalDirection = fast > slow ? "BUY" : "SELL";
  const macroDir: SignalDirection = macroClose > macroEma ? "BUY" : "SELL";
  if (triggerDir !== macroDir) return null; // no confluence — skip cleanly

  const crossIndex = lastCrossoverIndex(m15.closes);
  const barsSinceCross =
    crossIndex < 0 ? Number.POSITIVE_INFINITY : m15.closes.length - 1 - crossIndex;
  if (barsSinceCross > CROSSOVER_LOOKBACK) return null; // stale trigger

  const atr = last(
    ATR.calculate({ period: ATR_PERIOD, high: h1.highs, low: h1.lows, close: h1.closes }),
  );
  if (!atr || !Number.isFinite(atr) || atr <= 0) return null;

  const sign = triggerDir === "BUY" ? 1 : -1;
  const entry = round(spotPrice, instrument.decimals);
  const stopLoss = round(entry - sign * SL_ATR * atr, instrument.decimals);
  const targets: SignalTarget[] = TP_ATR.map((mult, i) => {
    const targetPrice = round(entry + sign * mult * atr, instrument.decimals);
    const { pips, label } = measureTarget(instrument, entry, targetPrice);
    return { id: (i + 1) as 1 | 2 | 3, price: targetPrice, pips, label, isHit: false, hitAt: null };
  });

  // Post-rounding sanity: a tiny ATR relative to the instrument's decimals
  // can collapse levels onto the entry — that is not a tradeable setup.
  const levels = [stopLoss, ...targets.map((t) => t.price)];
  const strictlyOrdered = levels.every(
    (level, i) => i === 0 || (triggerDir === "BUY" ? level > levels[i - 1]! : level < levels[i - 1]!),
  );
  const entryOutside =
    triggerDir === "BUY" ? stopLoss < entry && targets[0]!.price > entry : stopLoss > entry && targets[0]!.price < entry;
  if (!strictlyOrdered || !entryOutside) return null;

  // Confidence is computed, not invented: fresh cross, wide EMA separation
  // relative to volatility, and macro EMA alignment each add conviction.
  let confidence = 60;
  if (barsSinceCross <= 2) confidence += 12;
  if (Math.abs(fast - slow) > 0.5 * atr) confidence += 8;
  if (triggerDir === (macroFast > macroEma ? "BUY" : "SELL")) confidence += 8;
  confidence = Math.min(92, confidence);

  const atrPct = atr / entry;
  const risk = atrPct < 0.008 ? "Low" : atrPct < 0.02 ? "Medium" : "High";

  return {
    direction: triggerDir,
    status: "Active", // market entry at the live spot price
    entry,
    stopLoss,
    targets,
    confidence,
    risk,
    timeframe: "M15/H1",
    rr: `1:${TP_RISK_REWARD}`,
  };
}

/** Legacy rows stored take_profits as a plain [{price,hit}] array. */
export function normalizeEnvelope(raw: unknown, fallbackAnalysis = ""): SignalEnvelope {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const env = raw as Partial<SignalEnvelope>;
    if (env.version === 2 && Array.isArray(env.targets)) {
      return {
        version: 2,
        targets: env.targets as SignalTarget[],
        analysis: typeof env.analysis === "string" ? env.analysis : fallbackAnalysis,
        confidence: typeof env.confidence === "number" ? env.confidence : 70,
        risk: env.risk === "Low" || env.risk === "High" ? env.risk : "Medium",
        timeframe: typeof env.timeframe === "string" ? env.timeframe : "H1",
        rr: typeof env.rr === "string" ? env.rr : "1:3",
        breakeven: env.breakeven === true,
        openedAt: typeof env.openedAt === "string" ? env.openedAt : null,
        closedAt: typeof env.closedAt === "string" ? env.closedAt : null,
      };
    }
  }
  const legacy = Array.isArray(raw) ? (raw as { price?: number; hit?: boolean }[]) : [];
  return {
    version: 2,
    targets: legacy.slice(0, 3).map((tp, i) => ({
      id: (i + 1) as 1 | 2 | 3,
      price: Number(tp.price ?? 0),
      pips: 0,
      label: "",
      isHit: tp.hit === true,
      hitAt: null,
    })),
    analysis: fallbackAnalysis,
    confidence: 70,
    risk: "Medium",
    timeframe: "H1",
    rr: "1:3",
    breakeven: false,
    openedAt: null,
    closedAt: null,
  };
}

export type SignalEvent =
  | { type: "activated" }
  | { type: "breakeven" }
  | { type: "tp_hit"; tpId: number }
  | { type: "closed"; status: "Won" | "Lost" };

export interface SignalState {
  status: SignalStatus;
  direction: SignalDirection;
  entry: number;
  stopLoss: number;
  envelope: SignalEnvelope;
}

/** Advances one signal against the latest price. Returns new state + events. */
export function advanceSignal(
  state: SignalState,
  price: number,
  now: Date = new Date(),
): { state: SignalState; events: SignalEvent[] } {
  const events: SignalEvent[] = [];
  const next: SignalState = {
    ...state,
    envelope: {
      ...state.envelope,
      targets: state.envelope.targets.map((tp) => ({ ...tp })),
    },
  };
  const iso = now.toISOString();
  const isBuy = state.direction === "BUY";
  const reached = (level: number) => (isBuy ? price >= level : price <= level);
  const fellTo = (level: number) => (isBuy ? price <= level : price >= level);

  if (next.status === "Pending") {
    if (fellTo(next.entry)) {
      next.status = "Active";
      next.envelope.openedAt = iso;
      events.push({ type: "activated" });
    } else {
      return { state: next, events };
    }
  }
  if (next.status !== "Active") return { state: next, events };

  // Targets first: a candle that crosses both TP and SL is credited as a win.
  for (const tp of next.envelope.targets) {
    if (!tp.isHit && reached(tp.price)) {
      tp.isHit = true;
      tp.hitAt = iso;
      events.push({ type: "tp_hit", tpId: tp.id });
    }
  }
  const hits = next.envelope.targets.filter((tp) => tp.isHit).length;
  if (hits > 0 && !next.envelope.breakeven) {
    next.envelope.breakeven = true;
    events.push({ type: "breakeven" });
  }

  if (hits >= next.envelope.targets.length && next.envelope.targets.length > 0) {
    next.status = "Won";
    next.envelope.closedAt = iso;
    events.push({ type: "closed", status: "Won" });
    return { state: next, events };
  }

  const stopLevel = next.envelope.breakeven ? next.entry : next.stopLoss;
  if (fellTo(stopLevel)) {
    const won = next.envelope.breakeven || hits > 0;
    next.status = won ? "Won" : "Lost";
    next.envelope.closedAt = iso;
    events.push({ type: "closed", status: next.status });
  }
  return { state: next, events };
}

/** Running realized P&L figure shown on cards (pips / pct*100 / cents). */
export function realizedPips(envelope: SignalEnvelope): number {
  return envelope.targets.filter((tp) => tp.isHit).reduce((sum, tp) => sum + tp.pips, 0);
}

// --- Quote providers (IO boundary lives here; publisher injects fetch) ---

export async function fetchCoinbaseQuote(
  providerSymbol: string,
  fetchImpl: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<Quote> {
  const res = await fetchImpl(`https://api.coinbase.com/v2/prices/${providerSymbol}/spot`, {
    signal: withDeadline(deadline, 8_000),
  });
  if (!res.ok) throw new Error(`Coinbase quote failed: ${res.status}`);
  const json = (await res.json()) as { data?: { amount?: string } };
  const price = Number(json?.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Coinbase quote invalid");
  return { symbol: providerSymbol, price };
}

export async function fetchFinnhubQuote(
  providerSymbol: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  deadline?: AbortSignal,
): Promise<Quote> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(providerSymbol)}&token=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { signal: withDeadline(deadline, 8_000) });
  if (!res.ok) throw new Error(`Finnhub quote failed: ${res.status}`);
  const json = (await res.json()) as { c?: number };
  const price = Number(json?.c);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Finnhub quote invalid");
  return { symbol: providerSymbol, price };
}

/** Best-effort quotes for the whole universe; failures omit that instrument. */
export async function fetchUniverseQuotes(
  fetchImpl: typeof fetch = fetch,
  finnhubKey: string = process.env["FINNHUB_API_KEY"] ?? "",
  deadline?: AbortSignal,
): Promise<Map<string, number>> {
  const quotes = new Map<string, number>();
  await Promise.all(
    SIGNAL_UNIVERSE.map(async (instrument) => {
      try {
        const quote =
          instrument.provider === "coinbase"
            ? await fetchCoinbaseQuote(instrument.providerSymbol, fetchImpl, deadline)
            : await fetchFinnhubQuote(instrument.providerSymbol, finnhubKey, fetchImpl, deadline);
        quotes.set(instrument.symbol, quote.price);
      } catch {
        // A dead provider never blocks the rest of the universe.
      }
    }),
  );
  return quotes;
}

export function formatPrice(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

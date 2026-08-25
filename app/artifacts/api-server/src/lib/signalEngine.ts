/**
 * Multi-asset signal engine — pure logic.
 *
 * Universe: Forex (EUR/USD, GBP/USD, XAU/USD, USOIL), Crypto (BTC/ETH/SOL
 * via Coinbase spot — Binance is geo-blocked from this infrastructure), and
 * Stocks (AAPL, NVDA, TSLA via Finnhub). Everything here is deterministic
 * given the same inputs so tests can pin behavior; the publisher owns all IO.
 */
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
  /** "coinbase" (spot API, e.g. BTC-USD) or "finnhub" (/quote symbol). */
  provider: "coinbase" | "finnhub";
  providerSymbol: string;
  decimals: number;
  /** Forex pip size; null for crypto (%) and stocks ($). */
  pipSize: number | null;
  /** Typical stop distance as a fraction of price. */
  volatilityPct: number;
}

export const SIGNAL_UNIVERSE: Instrument[] = [
  { symbol: "EUR/USD", category: "forex", provider: "finnhub", providerSymbol: "OANDA:EUR_USD", decimals: 5, pipSize: 0.0001, volatilityPct: 0.0035 },
  { symbol: "GBP/USD", category: "forex", provider: "finnhub", providerSymbol: "OANDA:GBP_USD", decimals: 5, pipSize: 0.0001, volatilityPct: 0.0045 },
  { symbol: "XAU/USD", category: "forex", provider: "finnhub", providerSymbol: "OANDA:XAU_USD", decimals: 2, pipSize: 0.1, volatilityPct: 0.008 },
  { symbol: "USOIL", category: "forex", provider: "finnhub", providerSymbol: "OANDA:WTICO_USD", decimals: 2, pipSize: 0.01, volatilityPct: 0.012 },
  { symbol: "BTC/USD", category: "crypto", provider: "coinbase", providerSymbol: "BTC-USD", decimals: 1, pipSize: null, volatilityPct: 0.022 },
  { symbol: "ETH/USD", category: "crypto", provider: "coinbase", providerSymbol: "ETH-USD", decimals: 2, pipSize: null, volatilityPct: 0.028 },
  { symbol: "SOL/USD", category: "crypto", provider: "coinbase", providerSymbol: "SOL-USD", decimals: 2, pipSize: null, volatilityPct: 0.035 },
  { symbol: "AAPL", category: "stocks", provider: "finnhub", providerSymbol: "AAPL", decimals: 2, pipSize: null, volatilityPct: 0.015 },
  { symbol: "NVDA", category: "stocks", provider: "finnhub", providerSymbol: "NVDA", decimals: 2, pipSize: null, volatilityPct: 0.025 },
  { symbol: "TSLA", category: "stocks", provider: "finnhub", providerSymbol: "TSLA", decimals: 2, pipSize: null, volatilityPct: 0.03 },
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

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const round = (value: number, decimals: number): number =>
  Number(value.toFixed(decimals));

function targetLabel(instrument: Instrument, distance: number): { pips: number; label: string } {
  if (instrument.pipSize) {
    const pips = Math.round(distance / instrument.pipSize);
    return { pips, label: `+${pips}p` };
  }
  return { pips: 0, label: "" };
}

function cryptoPctLabel(entry: number, target: number): { pips: number; label: string } {
  const pct = (Math.abs(target - entry) / entry) * 100;
  return { pips: Math.round(pct * 100), label: `+${pct.toFixed(1)}%` };
}

function stockDollarLabel(entry: number, target: number): { pips: number; label: string } {
  const dollars = Math.abs(target - entry);
  return { pips: Math.round(dollars * 100), label: `+$${dollars.toFixed(2)}` };
}

function measureTarget(instrument: Instrument, entry: number, target: number): { pips: number; label: string } {
  if (instrument.category === "forex") return targetLabel(instrument, Math.abs(target - entry));
  if (instrument.category === "crypto") return cryptoPctLabel(entry, target);
  return stockDollarLabel(entry, target);
}

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

const TP_MULTIPLIERS = [1, 2, 3.2] as const;
const TIMEFRAMES = ["M15", "H1", "H4"] as const;

/** Deterministic setup synthesis: same instrument + rand stream → same signal. */
export function buildSignalParts(
  instrument: Instrument,
  price: number,
  rand: () => number,
): SignalParts {
  const direction: SignalDirection = rand() < 0.5 ? "BUY" : "SELL";
  const sign = direction === "BUY" ? 1 : -1;
  const slDistance = price * instrument.volatilityPct;
  // 30% of setups are pending limits placed slightly inside the market.
  const pending = rand() < 0.3;
  const entry = round(
    pending ? price - sign * slDistance * 0.3 : price,
    instrument.decimals,
  );
  const stopLoss = round(entry - sign * slDistance, instrument.decimals);
  const targets: SignalTarget[] = TP_MULTIPLIERS.map((mult, i) => {
    const targetPrice = round(entry + sign * slDistance * mult, instrument.decimals);
    const { pips, label } = measureTarget(instrument, entry, targetPrice);
    return { id: (i + 1) as 1 | 2 | 3, price: targetPrice, pips, label, isHit: false, hitAt: null };
  });
  const confidence = 62 + Math.floor(rand() * 31); // 62–92
  const risk = confidence >= 80 ? "Low" : confidence >= 70 ? "Medium" : "High";
  const timeframe = TIMEFRAMES[Math.floor(rand() * TIMEFRAMES.length)] ?? "H1";
  return {
    direction,
    status: pending ? "Pending" : "Active",
    entry,
    stopLoss,
    targets,
    confidence,
    risk,
    timeframe,
    rr: `1:${TP_MULTIPLIERS[2]}`,
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
        rr: typeof env.rr === "string" ? env.rr : "1:3.2",
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
    rr: "1:3.2",
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

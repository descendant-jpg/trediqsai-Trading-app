/**
 * Live signal publisher.
 *
 * Every cycle: pull best-effort quotes (Coinbase spot for crypto — Binance is
 * geo-blocked here; Finnhub for forex/stocks), advance open signals against
 * those prices (TP hits, break-even trailing, Won/Lost), and top up the
 * desk so each category keeps live setups. New signals get one lightweight
 * Claude rationale and every lifecycle event fans out as an Expo push.
 *
 * Storage rides on the existing `tradiqs_signals` table; richer metadata
 * (TP checkpoints, analysis, confidence, timeline) is versioned inside the
 * `take_profits` jsonb envelope because live DDL needs the SQL editor.
 */
import Anthropic from "@anthropic-ai/sdk";
import YahooFinance from "yahoo-finance2";
import { logger } from "./logger.js";
import { cycleDeadline, withDeadline } from "./httpTimeout.js";
import {
  SIGNAL_UNIVERSE,
  TP_RISK_REWARD,
  advanceSignal,
  buildTechnicalSetup,
  fetchUniverseCandles,
  fetchUniverseQuotes,
  normalizeEnvelope,
  realizedPips,
  type AssetCategory,
  type Instrument,
  type SignalEnvelope,
  type SignalStatus,
  type YahooChart,
  type YahooChartQuote,
} from "./signalEngine.js";
import { notifySignalEvent } from "./pushNotifications.js";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export const SIGNAL_PUBLISH_INTERVAL_MS = 90_000;
/**
 * Lease-window invariant: SHORTER than the publish interval (a fixed-window
 * counter lease can only grant once per window — a window longer than the
 * interval would halve the cadence) and LONGER than the worst-case cycle
 * (cycles are deadline-bounded below, so a lease can never expire while its
 * holder still runs). 90s tick → T=0 wins, T=90 new window wins again.
 */
export const PUBLISHER_LEASE_WINDOW_MS = 60_000;
/**
 * Hard bound on one cycle's wall-clock runtime. Top-up creation stops at the
 * deadline and every network call carries a timeout, so a cycle completes
 * well inside its lease window even when providers/AI stall.
 */
export const CYCLE_DEADLINE_MS = 45_000;
/** Open setups the desk tries to keep per category. */
export const OPEN_TARGET_PER_CATEGORY = 2;
const MAX_NEW_PER_CYCLE = 3;
const AI_MODEL = "claude-haiku-4-5-20251001";

interface SignalRow {
  id: string;
  pair: string;
  asset_class: string;
  action: string;
  status: SignalStatus;
  risk_reward: number;
  entry: number;
  stop_loss: number;
  take_profits: unknown;
  pips: number;
  timestamp: string;
}

const headers = () => ({
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
});

export function isSignalPublisherConfigured(): boolean {
  return !!SUPABASE_URL && !!SERVICE_KEY;
}

/** Exactly two sentences; the card and detail screen depend on brevity. */
export async function generateSignalRationale(parts: {
  symbol: string;
  category: AssetCategory;
  direction: string;
  entry: number;
  stopLoss: number;
  confidence: number;
  timeframe: string;
},
deadline?: AbortSignal,
): Promise<string> {
  const fallback =
    `${parts.symbol} shows a ${parts.direction === "BUY" ? "bullish" : "bearish"} ` +
    `${parts.timeframe} setup with momentum aligned at the ${parts.entry} trigger. ` +
    `Risk is capped at the ${parts.stopLoss} invalidation while targets scale out at three checkpoints.`;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return fallback;
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create(
      {
        // claude-3/3.5 ids 404 on this account (verified against /v1/models).
        model: AI_MODEL,
        max_tokens: 120,
        system:
          "You are an institutional trading desk analyst. Reply with exactly two concise sentences of technical rationale. No disclaimers, no emojis.",
        messages: [
          {
            role: "user",
            content:
              `${parts.category} signal: ${parts.direction} ${parts.symbol} at ${parts.entry}, ` +
              `stop ${parts.stopLoss}, confidence ${parts.confidence}%, timeframe ${parts.timeframe}. Explain the setup.`,
          },
        ],
      },
      // Cycles are deadline-bounded; a stalled provider must not outlive the lease.
      { timeout: 12_000, ...(deadline ? { signal: deadline } : {}) },
    );
    const text = res.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text.trim())
      .join(" ");
    return text || fallback;
  } catch (err) {
    logger.warn({ err }, "Signal rationale generation failed — using fallback");
    return fallback;
  }
}

/**
 * Live fallback candle provider (yahoo-finance2). Instantiated lazily and
 * injected into every cycle so tests never touch the network and a Yahoo
 * outage never crashes the publisher — the instrument is simply skipped.
 */
let yahooClient: InstanceType<typeof YahooFinance> | null = null;
/**
 * yahoo-finance2 owns its HTTP client and cannot consume our cycle
 * AbortSignal, so a hung request outlives the Promise.race that stops us
 * waiting on it. Capping in-flight fallback calls bounds those orphans: a
 * stalled Yahoo can never pile up sockets across cycles — once saturated,
 * the fallback is skipped and instruments resolve on their primary feeds.
 */
const MAX_YAHOO_IN_FLIGHT = 4;
let yahooInFlight = 0;
function defaultYahooChart(): YahooChart | null {
  try {
    yahooClient ??= new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const client = yahooClient;
    return async (symbol, options) => {
      if (yahooInFlight >= MAX_YAHOO_IN_FLIGHT) throw new Error("Yahoo fallback saturated");
      yahooInFlight += 1;
      try {
        return (await client.chart(symbol, options)) as { quotes?: YahooChartQuote[] };
      } finally {
        yahooInFlight -= 1;
      }
    };
  } catch (err) {
    logger.warn({ err }, "Yahoo Finance fallback unavailable");
    return null;
  }
}

export interface PublisherDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  notify?: typeof notifySignalEvent;
  rationale?: typeof generateSignalRationale;
  /** Live candle fallback (tests inject a synthetic chart). */
  yahooChart?: YahooChart | null;
  /** Absolute cycle deadline (tests inject an aborted signal). */
  signal?: AbortSignal;
}

async function selectRows(
  fetchImpl: typeof fetch,
  filter: string,
  deadline?: AbortSignal,
): Promise<SignalRow[]> {
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/tradiqs_signals?${filter}`, {
    headers: headers(),
    signal: withDeadline(deadline, 10_000),
  });
  if (!res.ok) throw new Error(`signals select failed: ${res.status}`);
  const rows = (await res.json()) as SignalRow[];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Compare-and-swap transition: the PATCH predicate pins BOTH the open status
 * AND the exact envelope this cycle read (jsonb equality is key-order
 * insensitive). If any competing cycle already wrote the row — closed it or
 * merely advanced a TP — the stored envelope no longer matches, zero rows
 * are updated, and the caller must NOT send lifecycle notifications (they
 * belong to the winning cycle). Returns true when this write landed.
 */
async function patchRowCAS(
  fetchImpl: typeof fetch,
  row: SignalRow,
  patch: Record<string, unknown>,
  deadline?: AbortSignal,
): Promise<boolean> {
  const predicate = new URLSearchParams({
    id: `eq.${row.id}`,
    status: "in.(Active,Pending)",
    take_profits: `eq.${JSON.stringify(row.take_profits ?? [])}`,
  });
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/tradiqs_signals?${predicate}`, {
    method: "PATCH",
    headers: { ...headers(), prefer: "return=representation" },
    body: JSON.stringify(patch),
    signal: withDeadline(deadline, 10_000),
  });
  if (!res.ok) throw new Error(`signal patch failed: ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Cross-instance mutual exclusion on the atomic rate_limit_consume RPC:
 * the first consumer in each lease window observes count === 1 and runs the
 * cycle; every other replica/cycle sees count > 1 and skips. The window
 * outlives the publish interval so a crashed winner only pauses the desk for
 * one cycle. Returns null when the counter store is unreachable — the desk
 * stays available (single-process deployments have no contention).
 */
export async function acquirePublisherLease(fetchImpl: typeof fetch): Promise<boolean | null> {
  try {
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/rate_limit_consume`, {
      method: "POST",
      headers: headers(),
      signal: withDeadline(undefined, 10_000),
      body: JSON.stringify({
        p_scope: "signal_publisher_lease",
        p_key: "cycle",
        p_window_ms: PUBLISHER_LEASE_WINDOW_MS,
      }),
    });
    if (!res.ok) return null;
    const count = (await res.json()) as number;
    if (typeof count !== "number" || !Number.isFinite(count)) return null;
    return count === 1;
  } catch {
    return null;
  }
}

let cycleInFlight = false;

async function insertRow(
  fetchImpl: typeof fetch,
  row: Record<string, unknown>,
  deadline?: AbortSignal,
): Promise<string | null> {
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/tradiqs_signals`, {
    method: "POST",
    headers: { ...headers(), prefer: "return=representation" },
    body: JSON.stringify(row),
    signal: withDeadline(deadline, 10_000),
  });
  if (!res.ok) throw new Error(`signal insert failed: ${res.status}`);
  const rows = (await res.json()) as { id?: string }[];
  return rows[0]?.id ?? null;
}

const instrumentFor = (pair: string): Instrument | undefined =>
  SIGNAL_UNIVERSE.find((instrument) => instrument.symbol === pair);

/** One full engine cycle. Exported for tests; all IO injectable. */
export async function runSignalCycle({
  fetchImpl = fetch,
  now = () => new Date(),
  notify = notifySignalEvent,
  rationale = generateSignalRationale,
  yahooChart = defaultYahooChart(),
  signal: signalOverride,
}: PublisherDeps = {}): Promise<void> {
  if (!isSignalPublisherConfigured()) return;
  // In-process guard set SYNCHRONOUSLY (before any await) so two calls made
  // in the same tick can never both pass — even when the lease store is down.
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    // Distributed lease (cross-replica): first consumer in each window runs.
    const lease = await acquirePublisherLease(fetchImpl);
    if (lease === false) return;
    if (lease === null) {
      logger.warn("Signal publisher lease unavailable — running with in-process guard only");
    }
    // ONE absolute deadline for the whole cycle, always shorter than the
    // lease window: every quote, Supabase read/write, Anthropic call and
    // push fan-out is bound to it, so a cycle can never outlive its lease
    // and overlap with the next tick's winner.
    const signal = signalOverride ?? cycleDeadline(CYCLE_DEADLINE_MS);
    await runCycle({ fetchImpl, now, notify, rationale, yahooChart, signal });
  } finally {
    cycleInFlight = false;
  }
}

async function runCycle({
  fetchImpl,
  now,
  notify,
  rationale,
  yahooChart,
  signal,
}: Required<PublisherDeps>): Promise<void> {
  const quotes = await fetchUniverseQuotes(fetchImpl, undefined, signal);
  if (!quotes.size) return;
  // Live candle history powers the technical trigger engine. Instruments
  // whose feeds are down are simply absent from this map and get skipped.
  const candles = await fetchUniverseCandles(
    fetchImpl,
    process.env["FINNHUB_API_KEY"] ?? "",
    signal,
    yahooChart,
  );
  const stamp = now();
  const iso = stamp.toISOString();

  // 1) Advance open signals against fresh prices.
  const open = await selectRows(
    fetchImpl,
    "select=id,pair,asset_class,action,status,risk_reward,entry,stop_loss,take_profits,pips,timestamp&status=in.(Active,Pending)",
    signal,
  );
  for (const row of open) {
    // Absolute deadline: defer remaining transitions to the next tick rather
    // than risk outliving the lease and overlapping with its next holder.
    if (signal.aborted) {
      logger.warn("Signal cycle deadline reached — deferring remaining transitions to the next cycle");
      break;
    }
    const price = quotes.get(row.pair);
    if (price === undefined) continue;
    const direction = row.action === "SELL" ? "SELL" : "BUY";
    const { state, events } = advanceSignal(
      {
        status: row.status,
        direction,
        entry: Number(row.entry),
        stopLoss: Number(row.stop_loss),
        envelope: normalizeEnvelope(row.take_profits),
      },
      price,
      stamp,
    );
    if (!events.length) continue;
    try {
      // CAS write against the exact row this cycle read: if a competing
      // cycle already advanced it, zero rows match and its notifications
      // belong to that cycle.
      const landed = await patchRowCAS(fetchImpl, row, {
        status: state.status,
        take_profits: state.envelope,
        pips: realizedPips(state.envelope),
      }, signal);
      if (!landed) continue;
    } catch (err) {
      logger.error({ err, signalId: row.id }, "Signal status update failed");
      continue;
    }
    for (const event of events) {
      if (event.type === "tp_hit") {
        const tp = state.envelope.targets.find((target) => target.id === event.tpId);
        await notify("🎯 TP Hit", `TP${event.tpId} Hit: ${row.pair} ${tp?.label ?? ""}`, {
          signal_id: row.id,
        }, fetchImpl, signal);
      } else if (event.type === "closed") {
        await notify(
          event.status === "Won" ? "✅ Signal Won" : "❌ Signal Closed",
          `${row.pair} ${row.action} closed: ${event.status.toUpperCase()}`,
          { signal_id: row.id },
          fetchImpl,
          signal,
        );
      }
    }
  }

  // 2) Top up categories below the open-signal target.
  const openByCategory = new Map<AssetCategory, number>();
  const freshRows = await selectRows(
    fetchImpl,
    "select=id,pair,asset_class,status&status=in.(Active,Pending)",
    signal,
  );
  for (const row of freshRows) {
    const instrument = instrumentFor(row.pair);
    if (!instrument) continue;
    openByCategory.set(instrument.category, (openByCategory.get(instrument.category) ?? 0) + 1);
  }

  let created = 0;
  for (const instrument of SIGNAL_UNIVERSE) {
    if (created >= MAX_NEW_PER_CYCLE) break;
    // Never outlive the lease window: the absolute deadline aborts all IO and
    // stops creation so the next tick's winner takes over with no overlap.
    if (signal.aborted) {
      logger.warn("Signal cycle deadline reached — deferring remaining top-up to the next cycle");
      break;
    }
    const price = quotes.get(instrument.symbol);
    if (price === undefined) continue;
    const openCount = openByCategory.get(instrument.category) ?? 0;
    if (openCount >= OPEN_TARGET_PER_CATEGORY) continue;

    // Mathematical gate: no live candle history or no multi-timeframe
    // confluence → no signal. Nothing is ever synthesized.
    const feed = candles.get(instrument.symbol);
    if (!feed) continue;
    const parts = buildTechnicalSetup(instrument, price, feed);
    if (!parts) continue;
    const analysis = await rationale({
      symbol: instrument.symbol,
      category: instrument.category,
      direction: parts.direction,
      entry: parts.entry,
      stopLoss: parts.stopLoss,
      confidence: parts.confidence,
      timeframe: parts.timeframe,
    }, signal);
    const envelope: SignalEnvelope = {
      version: 2,
      targets: parts.targets,
      analysis,
      confidence: parts.confidence,
      risk: parts.risk,
      timeframe: parts.timeframe,
      rr: parts.rr,
      breakeven: false,
      openedAt: parts.status === "Active" ? iso : null,
      closedAt: null,
    };
    try {
      const id = await insertRow(fetchImpl, {
        pair: instrument.symbol,
        asset_class: instrument.category,
        action: parts.direction,
        status: parts.status,
        risk_reward: TP_RISK_REWARD,
        entry: parts.entry,
        stop_loss: parts.stopLoss,
        take_profits: envelope,
        pips: 0,
      }, signal);
      created += 1;
      openByCategory.set(instrument.category, openCount + 1);
      if (id) {
        await notify(
          "🚨 New Signal",
          `${instrument.symbol} ${parts.direction} @ ${parts.entry}`,
          { signal_id: id },
          fetchImpl,
          signal,
        );
      }
    } catch (err) {
      logger.error({ err, symbol: instrument.symbol }, "Signal creation failed");
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startSignalPublisher(): void {
  if (timer || !isSignalPublisherConfigured()) return;
  const tick = () =>
    runSignalCycle().catch((err: unknown) => logger.error({ err }, "Signal cycle failed"));
  void tick();
  timer = setInterval(() => void tick(), SIGNAL_PUBLISH_INTERVAL_MS);
  timer.unref?.();
}

export function stopSignalPublisher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

import { Router, type IRouter } from "express";
import { hasProAccess, type TierLookup } from "../lib/entitlement";
import { identity, requestUserId, ANONYMOUS_USER, type TokenVerifier } from "../middlewares/identity";
import { logger } from "../lib/logger";
import {
  normalizeEnvelope,
  realizedPips,
  type AssetCategory,
  type SignalEnvelope,
  type SignalTarget,
} from "../lib/signalEngine";

/*
 * Storage: live `tradiqs_signals` table. Rich metadata (TP checkpoints,
 * AI analysis, confidence, timeline) is versioned inside the existing
 * `take_profits` jsonb envelope — live DDL needs the SQL editor.
 *
 * Free-tier quota: free users unlock up to FREE_DAILY_SIGNAL_LIMIT signals
 * per day. Server-authoritative via the existing `rate_limit_consume` /
 * `rate_limit_peek` RPCs (rate_limit_counters table):
 *   scope 'signal_daily'  — per-user rolling 24h unlock counter
 *   scope 'signal_view'   — per user+signal marker; viewed signals stay readable
 */

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export const FREE_DAILY_SIGNAL_LIMIT = 5;
const DAILY_WINDOW_MS = 86_400_000;
const VIEW_WINDOW_MS = 10 * 365 * 86_400_000;

export interface SignalListItem {
  id: string;
  pair: string;
  assetClass: AssetCategory;
  action: "BUY" | "SELL";
  status: "Active" | "Won" | "Lost" | "Pending";
  riskReward: string;
  entry: number | "LOCKED";
  stopLoss: number | "LOCKED";
  takeProfits: SignalTarget[];
  timestamp: number;
  pips: number | "LOCKED";
  analysis: string | null;
  confidence: number | null;
  risk: "Low" | "Medium" | "High";
  timeframe: string;
  breakeven: boolean;
  openedAt: number | null;
  closedAt: number | null;
  locked: boolean;
}

export interface SignalQuota {
  premium: boolean;
  limit: number;
  used: number;
  remaining: number;
}

type SignalRow = {
  id: string; pair: string; asset_class: string; action: string;
  status: SignalListItem["status"]; risk_reward: number; entry: number;
  stop_loss: number; take_profits: unknown; timestamp: string; pips: number;
};

function headers() {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
  };
}

function normalizeCategory(raw: string): AssetCategory {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("crypto")) return "crypto";
  if (value.includes("stock") || value.includes("equit")) return "stocks";
  return "forex"; // forex / metals / commodities trade in pips
}

function toListItem(row: SignalRow, locked: boolean): SignalListItem {
  const envelope: SignalEnvelope = normalizeEnvelope(row.take_profits);
  const timestamp = Date.parse(row.timestamp);
  const base = {
    id: row.id,
    pair: row.pair,
    assetClass: normalizeCategory(row.asset_class),
    action: row.action === "SELL" ? ("SELL" as const) : ("BUY" as const),
    status: row.status,
    riskReward: envelope.rr,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    risk: envelope.risk,
    timeframe: envelope.timeframe,
    breakeven: envelope.breakeven,
    openedAt: envelope.openedAt ? Date.parse(envelope.openedAt) : null,
    closedAt: envelope.closedAt ? Date.parse(envelope.closedAt) : null,
  };
  if (locked) {
    return {
      ...base,
      entry: "LOCKED",
      stopLoss: "LOCKED",
      takeProfits: [],
      pips: "LOCKED",
      analysis: null,
      confidence: null,
      locked: true,
    };
  }
  return {
    ...base,
    entry: Number(row.entry),
    stopLoss: Number(row.stop_loss),
    takeProfits: envelope.targets,
    pips: Number.isFinite(Number(row.pips)) ? Number(row.pips) : realizedPips(envelope),
    analysis: envelope.analysis || null,
    confidence: envelope.confidence,
    locked: false,
  };
}

export interface SignalsRouterOptions {
  verifier?: TokenVerifier;
  tierLookup?: TierLookup;
  fetchImpl?: typeof fetch;
}

async function rpcNumber(
  fetchImpl: typeof fetch,
  fn: "rate_limit_consume" | "rate_limit_peek",
  scope: string,
  key: string,
  windowMs: number,
): Promise<number | null> {
  try {
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ p_scope: scope, p_key: key, p_window_ms: windowMs }),
    });
    if (!res.ok) return null;
    const value = (await res.json()) as number;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Signal ids this user has previously unlocked (markers never expire). */
async function viewedSignalIds(fetchImpl: typeof fetch, userId: string): Promise<Set<string> | null> {
  try {
    const query = new URLSearchParams({
      scope: "eq.signal_view",
      key: `like.${userId}:*`,
      select: "key",
      limit: "1000",
    });
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rate_limit_counters?${query}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { key?: string }[];
    const ids = new Set<string>();
    for (const row of rows) {
      const key = row.key ?? "";
      if (key.startsWith(`${userId}:`)) ids.add(key.slice(userId.length + 1));
    }
    return ids;
  } catch {
    return null;
  }
}

async function selectSignalRows(fetchImpl: typeof fetch, id?: string): Promise<SignalRow[] | null> {
  try {
    const base = "select=id,pair,asset_class,action,status,risk_reward,entry,stop_loss,take_profits,timestamp,pips";
    const filter = id ? `&id=eq.${encodeURIComponent(id)}&limit=1` : "&order=timestamp.desc&limit=60";
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/tradiqs_signals?${base}${filter}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as SignalRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return null;
  }
}

export function createSignalsRouter({
  verifier,
  tierLookup,
  fetchImpl = fetch,
}: SignalsRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  router.use("/signals", identity(verifier));

  const requireUser = (res: import("express").Response): string | null => {
    const userId = requestUserId(res);
    if (!userId || userId === ANONYMOUS_USER) {
      res.status(401).json({ error: "Sign in required." });
      return null;
    }
    return userId;
  };

  const configured = (res: import("express").Response): boolean => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      res.status(503).json({ error: "Live signals database is not configured." });
      return false;
    }
    return true;
  };

  router.get("/signals", async (_req, res) => {
    const userId = requireUser(res);
    if (!userId || !configured(res)) return;

    const premium = await hasProAccess(userId, tierLookup);
    const rows = await selectSignalRows(fetchImpl);
    if (!rows) {
      res.status(503).json({ error: "Live signal feed is temporarily unavailable." });
      return;
    }

    let used = 0;
    let viewed: Set<string> | null = null;
    if (!premium) {
      const [dailyUsed, viewedIds] = await Promise.all([
        rpcNumber(fetchImpl, "rate_limit_peek", "signal_daily", userId, DAILY_WINDOW_MS),
        viewedSignalIds(fetchImpl, userId),
      ]);
      // Fail closed: a quota outage must not leak premium targets.
      used = dailyUsed ?? FREE_DAILY_SIGNAL_LIMIT;
      viewed = viewedIds ?? new Set<string>();
    }

    const signals = rows.map((row) => toListItem(row, !premium && !viewed?.has(row.id)));
    const quota: SignalQuota = premium
      ? { premium: true, limit: FREE_DAILY_SIGNAL_LIMIT, used: 0, remaining: FREE_DAILY_SIGNAL_LIMIT }
      : {
          premium: false,
          limit: FREE_DAILY_SIGNAL_LIMIT,
          used: Math.min(used, FREE_DAILY_SIGNAL_LIMIT),
          remaining: Math.max(0, FREE_DAILY_SIGNAL_LIMIT - used),
        };
    res.json({ signals, quota });
  });

  router.get("/signals/:id", async (req, res) => {
    const userId = requireUser(res);
    if (!userId || !configured(res)) return;
    const id = String(req.params.id ?? "");
    const rows = await selectSignalRows(fetchImpl, id);
    const row = rows?.[0];
    if (!row) {
      res.status(404).json({ error: "Signal not found." });
      return;
    }
    const premium = await hasProAccess(userId, tierLookup);
    if (premium) {
      res.json(toListItem(row, false));
      return;
    }
    const viewed = await rpcNumber(fetchImpl, "rate_limit_peek", "signal_view", `${userId}:${row.id}`, VIEW_WINDOW_MS);
    if ((viewed ?? 0) > 0) {
      res.json(toListItem(row, false));
      return;
    }
    res.status(402).json({ error: "Upgrade or use a free daily unlock to view this signal.", locked: true });
  });

  router.post("/signals/:id/unlock", async (req, res) => {
    const userId = requireUser(res);
    if (!userId || !configured(res)) return;
    const id = String(req.params.id ?? "");
    const rows = await selectSignalRows(fetchImpl, id);
    const row = rows?.[0];
    if (!row) {
      res.status(404).json({ error: "Signal not found." });
      return;
    }

    const premium = await hasProAccess(userId, tierLookup);
    if (!premium) {
      // Consume-first, fail closed. The view marker is written only after the
      // daily charge commits, so a locked signal is NEVER observable as
      // "viewed" before its entitlement is paid — no disclosure window.
      // Accepted tradeoff until a transactional unlock RPC can be added via
      // the Supabase SQL editor: a same-signal race can charge two daily
      // slots, and a marker-write failure after charging loses one slot.
      // Quota loss, never disclosure.
      const viewedKey = `${userId}:${row.id}`;
      const viewed = await rpcNumber(fetchImpl, "rate_limit_peek", "signal_view", viewedKey, VIEW_WINDOW_MS);
      if ((viewed ?? 0) === 0) {
        const count = await rpcNumber(fetchImpl, "rate_limit_consume", "signal_daily", userId, DAILY_WINDOW_MS);
        if (count === null) {
          res.status(503).json({ error: "Could not record the unlock. Please try again." });
          return;
        }
        if (count > FREE_DAILY_SIGNAL_LIMIT) {
          res.status(402).json({
            error: "Daily free signal limit reached. Upgrade for unlimited signals.",
            locked: true,
            quotaExceeded: true,
          });
          return;
        }
        const marked = await rpcNumber(fetchImpl, "rate_limit_consume", "signal_view", viewedKey, VIEW_WINDOW_MS);
        if (marked === null) {
          res.status(503).json({ error: "Could not record the unlock. Please try again." });
          return;
        }
      }
    }

    const used = premium
      ? 0
      : (await rpcNumber(fetchImpl, "rate_limit_peek", "signal_daily", userId, DAILY_WINDOW_MS)) ?? FREE_DAILY_SIGNAL_LIMIT;
    res.json({
      signal: toListItem(row, false),
      quota: {
        premium,
        limit: FREE_DAILY_SIGNAL_LIMIT,
        used: Math.min(used, FREE_DAILY_SIGNAL_LIMIT),
        remaining: Math.max(0, FREE_DAILY_SIGNAL_LIMIT - used),
      } satisfies SignalQuota,
    });
  });

  router.use((err: unknown, _req: unknown, res: import("express").Response, _next: unknown) => {
    logger.error({ err }, "Signals route failed");
    res.status(500).json({ error: "Signal desk request failed." });
  });

  return router;
}

export default createSignalsRouter();

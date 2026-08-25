import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createSignalsRouter } from "./signals";

process.env["SUPABASE_URL"] = "https://stub.supabase.co";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "stub-service-key";

const ENVELOPE = {
  version: 2,
  targets: [
    { id: 1, price: 2470, pips: 100, label: "+100p", isHit: true, hitAt: "2026-08-25T10:00:00Z" },
    { id: 2, price: 2480, pips: 200, label: "+200p", isHit: false, hitAt: null },
    { id: 3, price: 2492, pips: 320, label: "+320p", isHit: false, hitAt: null },
  ],
  analysis: "Gold holds the 2460 pivot with H1 momentum aligned.",
  confidence: 78,
  risk: "Low",
  timeframe: "H1",
  rr: "1:3.2",
  breakeven: true,
  openedAt: "2026-08-25T09:00:00Z",
  closedAt: null,
};

const ROW = {
  id: "sig-1",
  pair: "XAU/USD",
  asset_class: "forex",
  action: "BUY",
  status: "Active",
  risk_reward: 3.2,
  entry: 2460,
  stop_loss: 2452,
  take_profits: ENVELOPE,
  pips: 100,
  timestamp: "2026-08-25T08:30:00.000Z",
};

type QuotaState = {
  dailyUsed?: number;
  viewed?: string[];
  consumed?: { scope: string; key: string }[];
  deleted?: string[];
  /** When set, the next signal_view consume returns this (race simulation). */
  markResult?: number;
};

/** Fake PostgREST + RPC surface for the signals router. */
function fakeFetch(rows: unknown[], quota: QuotaState = {}): typeof fetch {
  const consumed = quota.consumed ?? [];
  quota.consumed = consumed;
  const deleted = quota.deleted ?? [];
  quota.deleted = deleted;
  return (async (url: string, init?: RequestInit) => {
    if (url.includes("/rest/v1/tradiqs_signals")) {
      if (url.includes("id=eq.")) {
        const id = decodeURIComponent(url.split("id=eq.")[1]!.split("&")[0]!);
        return new Response(JSON.stringify(rows.filter((r) => (r as { id: string }).id === id)), { status: 200 });
      }
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (url.includes("/rest/v1/rate_limit_counters")) {
      if (init?.method === "DELETE") {
        const key = decodeURIComponent(url.split("key=eq.")[1] ?? "");
        deleted.push(key);
        quota.viewed = (quota.viewed ?? []).filter((id) => `trader-1:${id}` !== key);
        return new Response("[]", { status: 200 });
      }
      const keys = (quota.viewed ?? []).map((id) => ({ key: `trader-1:${id}` }));
      return new Response(JSON.stringify(keys), { status: 200 });
    }
    if (url.includes("/rpc/rate_limit_peek")) {
      const body = JSON.parse(String(init?.body)) as { p_scope: string; p_key: string };
      if (body.p_scope === "signal_daily") return new Response(JSON.stringify(quota.dailyUsed ?? 0));
      const viewedId = body.p_key.split(":")[1];
      return new Response(JSON.stringify((quota.viewed ?? []).includes(viewedId ?? "") ? 1 : 0));
    }
    if (url.includes("/rpc/rate_limit_consume")) {
      const body = JSON.parse(String(init?.body)) as { p_scope: string; p_key: string };
      consumed.push({ scope: body.p_scope, key: body.p_key });
      if (body.p_scope === "signal_daily") {
        quota.dailyUsed = (quota.dailyUsed ?? 0) + 1;
        return new Response(JSON.stringify(quota.dailyUsed));
      }
      // signal_view marker
      const signalId = body.p_key.split(":")[1] ?? "";
      if (quota.markResult !== undefined) {
        const forced = quota.markResult;
        quota.markResult = undefined;
        return new Response(JSON.stringify(forced));
      }
      const already = (quota.viewed ?? []).includes(signalId);
      if (!already) quota.viewed = [...(quota.viewed ?? []), signalId];
      return new Response(JSON.stringify(already ? 2 : 1));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function buildApp(fetchImpl: typeof fetch, opts: { pro?: boolean; anon?: boolean } = {}) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.headers.authorization = opts.anon ? "" : "Bearer test-token";
    next();
  });
  server.use(
    createSignalsRouter({
      verifier: async (token: string) =>
        token === "test-token" && !opts.anon ? "trader-1" : null,
      tierLookup: async () => (opts.pro ? "pro" : "free"),
      fetchImpl,
    }),
  );
  return server;
}

describe("GET /signals", () => {
  it("returns the full desk with quota metadata for premium users", async () => {
    const response = await request(buildApp(fakeFetch([ROW]), { pro: true })).get("/signals");
    expect(response.status).toBe(200);
    expect(response.body.quota).toEqual({ premium: true, limit: 5, used: 0, remaining: 5 });
    const signal = response.body.signals[0];
    expect(signal.locked).toBe(false);
    expect(signal.entry).toBe(2460);
    expect(signal.takeProfits).toHaveLength(3);
    expect(signal.analysis).toContain("2460");
    expect(signal.assetClass).toBe("forex");
  });

  it("redacts unviewed signals for free users and reports remaining quota", async () => {
    const response = await request(buildApp(fakeFetch([ROW], { dailyUsed: 2 }))).get("/signals");
    expect(response.status).toBe(200);
    expect(response.body.quota).toEqual({ premium: false, limit: 5, used: 2, remaining: 3 });
    const signal = response.body.signals[0];
    expect(signal.locked).toBe(true);
    expect(signal.entry).toBe("LOCKED");
    expect(signal.takeProfits).toEqual([]);
    expect(signal.analysis).toBeNull();
    // Metadata stays visible so the card still sells the setup.
    expect(signal.pair).toBe("XAU/USD");
    expect(signal.status).toBe("Active");
  });

  it("keeps previously unlocked signals readable for free users", async () => {
    const response = await request(buildApp(fakeFetch([ROW], { viewed: ["sig-1"] }))).get("/signals");
    expect(response.body.signals[0].locked).toBe(false);
    expect(response.body.signals[0].entry).toBe(2460);
  });

  it("requires authentication", async () => {
    const response = await request(buildApp(fakeFetch([ROW]), { anon: true })).get("/signals");
    expect(response.status).toBe(401);
  });
});

describe("GET /signals/:id", () => {
  it("serves full detail to premium users", async () => {
    const response = await request(buildApp(fakeFetch([ROW]), { pro: true })).get("/signals/sig-1");
    expect(response.status).toBe(200);
    expect(response.body.confidence).toBe(78);
    expect(response.body.breakeven).toBe(true);
  });

  it("returns 402 for free users who have not unlocked the signal", async () => {
    const response = await request(buildApp(fakeFetch([ROW]))).get("/signals/sig-1");
    expect(response.status).toBe(402);
    expect(response.body.locked).toBe(true);
  });

  it("serves viewed signals to free users", async () => {
    const response = await request(buildApp(fakeFetch([ROW], { viewed: ["sig-1"] }))).get("/signals/sig-1");
    expect(response.status).toBe(200);
    expect(response.body.takeProfits[0].isHit).toBe(true);
  });

  it("404s unknown ids", async () => {
    const response = await request(buildApp(fakeFetch([ROW]), { pro: true })).get("/signals/nope");
    expect(response.status).toBe(404);
  });
});

describe("POST /signals/:id/unlock", () => {
  it("charges one daily slot first, then records the permanent view marker", async () => {
    const quota: QuotaState = {};
    const response = await request(buildApp(fakeFetch([ROW], quota))).post("/signals/sig-1/unlock");
    expect(response.status).toBe(200);
    expect(response.body.signal.entry).toBe(2460);
    expect(response.body.quota.remaining).toBe(4);
    // Charge BEFORE marking: a marker is never observable before entitlement
    // commits, so no concurrent request can read a signal it didn't pay for.
    expect(quota.consumed).toEqual([
      { scope: "signal_daily", key: "trader-1" },
      { scope: "signal_view", key: "trader-1:sig-1" },
    ]);
  });

  it("is idempotent for previously viewed signals without consuming quota", async () => {
    const quota: QuotaState = { viewed: ["sig-1"], dailyUsed: 3 };
    const response = await request(buildApp(fakeFetch([ROW], quota))).post("/signals/sig-1/unlock");
    expect(response.status).toBe(200);
    expect(response.body.quota.remaining).toBe(2);
    expect(quota.consumed).toEqual([]);
  });

  it("still serves the signal when the marker write races (charge-then-mark is safe)", async () => {
    // Simulate: this request paid the daily slot, but a racing request had
    // already written the marker (consume returns 2). The user paid, so the
    // signal is served; the marker race costs no extra slot either way.
    const quota: QuotaState = { markResult: 2, dailyUsed: 1 };
    const response = await request(buildApp(fakeFetch([ROW], quota))).post("/signals/sig-1/unlock");
    expect(response.status).toBe(200);
    expect(response.body.signal.entry).toBe(2460);
    expect(quota.consumed).toEqual([
      { scope: "signal_daily", key: "trader-1" },
      { scope: "signal_view", key: "trader-1:sig-1" },
    ]);
    expect(quota.dailyUsed).toBe(2);
  });

  it("returns 402 and never marks the signal when the daily limit is exhausted", async () => {
    const quota: QuotaState = { dailyUsed: 5 };
    const response = await request(buildApp(fakeFetch([ROW], quota))).post("/signals/sig-1/unlock");
    expect(response.status).toBe(402);
    expect(response.body.quotaExceeded).toBe(true);
    // No marker was written — the signal cannot become readable for free.
    expect(quota.consumed).toEqual([{ scope: "signal_daily", key: "trader-1" }]);
    expect(quota.viewed ?? []).toEqual([]);
  });

  it("never consumes quota for premium users", async () => {
    const quota: QuotaState = {};
    const response = await request(buildApp(fakeFetch([ROW], quota), { pro: true })).post("/signals/sig-1/unlock");
    expect(response.status).toBe(200);
    expect(response.body.quota.premium).toBe(true);
    expect(quota.consumed).toEqual([]);
  });
});

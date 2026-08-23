import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  GetAutopilotResponse,
  GetAutopilotHistoryResponse,
} from "@workspace/api-zod";

const TICK_MS = 2_600;

let server: Server;
let baseUrl: string;
/** Rows persisted through the mocked db, inspectable/seedable from tests. */
let botRows: Map<string, any>;
let stateRows: Map<string, any>;
let historyRows: Map<string, any>;
/** Serializes fake-db transactions like the per-user advisory lock does. */
let txLock: Promise<void> = Promise.resolve();

async function startFreshApp(): Promise<void> {
  // The autopilot router keeps in-memory state at module scope; re-import a
  // fresh copy per test so cases don't leak state into each other.
  vi.resetModules();
  // Replace the Postgres-backed persistence with an in-memory fake so the
  // tests stay hermetic (no DATABASE_URL / migrated tables required). The
  // fake supports exactly the query shapes autopilot.ts uses: select-all,
  // select-where, and insert ... onConflictDoUpdate (upsert). The row maps
  // live in this function's scope so they survive vi.resetModules within a
  // test (simulating a server restart) but reset for each fresh test.
  botRows = new Map<string, any>();
  stateRows = new Map<string, any>();
  historyRows = new Map<string, any>();
  txLock = Promise.resolve();
  const rowsForRestart = historyRows;
  vi.doMock("@workspace/db", () => {
    // Rows are keyed per user, mirroring the real tables' conflict targets:
    // (userId, botId) for bots, userId for state, (userId, dayIso) for
    // P&L history.
    const autopilotBotsTable = { id: {}, userId: {}, botId: {} };
    const autopilotStateTable = { id: {}, userId: {} };
    const autopilotPnlHistoryTable = { userId: {}, dayIso: {} };
    // Extract the bound value from a drizzle `eq(column, value)` SQL object.
    // Its queryChunks contain the column, an operator chunk, and a Param
    // whose `.value` is the compared value (the userId in autopilot.ts).
    const eqValue = (cond: any): unknown => {
      const chunks: any[] = cond?.queryChunks ?? [];
      // With a plain-object fake column, drizzle inlines the compared value
      // as a raw string chunk (the only string in the chunk list).
      return chunks.find((c) => typeof c === "string");
    };
    const rowsFor = (table: any): Map<string, any> =>
      table === autopilotBotsTable
        ? botRows
        : table === autopilotPnlHistoryTable
          ? rowsForRestart
          : stateRows;
    const db = {
      select: () => ({
        from: (table: any) => {
          const all = [...rowsFor(table).values()];
          return Object.assign(Promise.resolve(all), {
            where: (cond: any) => {
              const userId = eqValue(cond);
              return Promise.resolve(all.filter((r) => r.userId === userId));
            },
          });
        },
      }),
      insert: (table: any) => ({
        values: (values: any) => ({
          onConflictDoUpdate: () => {
            if (table === autopilotBotsTable) {
              botRows.set(`${values.userId}:${values.botId ?? values.id}`, {
                ...values,
              });
            } else if (table === autopilotPnlHistoryTable) {
              rowsForRestart.set(`${values.userId}:${values.dayIso}`, {
                ...values,
              });
            } else {
              stateRows.set(values.userId, { ...values });
            }
            return Promise.resolve();
          },
          onConflictDoNothing: () => {
            const key =
              table === autopilotBotsTable
                ? `${values.userId}:${values.botId ?? values.id}`
                : table === autopilotPnlHistoryTable
                  ? `${values.userId}:${values.dayIso}`
                  : values.userId;
            const map = rowsFor(table);
            if (!map.has(key)) map.set(key, { ...values });
            return Promise.resolve();
          },
        }),
      }),
      update: (table: any) => ({
        set: (values: any) => ({
          where: (cond: any) => {
            // Collect nested condition SQL objects (and(eq(...), eq(...)))
            // in order: the first eq value is the userId, the second the
            // botId.
            const conds: any[] = [];
            const walk = (node: any) => {
              for (const chunk of node?.queryChunks ?? []) {
                if (
                  chunk &&
                  typeof chunk === "object" &&
                  Array.isArray(chunk.queryChunks)
                ) {
                  conds.push(chunk);
                  walk(chunk);
                }
              }
            };
            walk(cond);
            if (table === autopilotBotsTable && conds.length >= 2) {
              const key = `${eqValue(conds[0])}:${eqValue(conds[1])}`;
              const row = botRows.get(key);
              if (row) botRows.set(key, { ...row, ...values });
            }
            return Promise.resolve();
          },
        }),
      }),
      execute: () => Promise.resolve(),
      transaction: async (cb: any) => {
        // Serialize transactions like the production per-user advisory lock,
        // so cross-instance races are reproduced faithfully in-process.
        const prev = txLock;
        let release!: () => void;
        txLock = new Promise<void>((r) => {
          release = r;
        });
        await prev;
        try {
          return await cb(db);
        } finally {
          release();
        }
      },
    };
    return { db, autopilotBotsTable, autopilotStateTable, autopilotPnlHistoryTable };
  });
  const { createAutopilotRouter } = await import("./autopilot");
  const app: Express = express();
  app.use(express.json());
  app.use(
    createAutopilotRouter(
      async (token) => (token === "test-pro" ? "test-pro-user" : null),
      async () => "pro",
      (_req, _res, next) => next(),
    ),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: "Bearer test-pro",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(async () => {
  // Only fake Date so real network/socket timers keep working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-05T10:00:00"));
  // No DB wipe needed: startFreshApp installs a brand-new in-memory db fake
  // per test, so every case starts from freshly seeded defaults.
  await startFreshApp();
  // Authenticated callers get their own state; establish its simulation
  // clock at suite setup instead of relying on the retired anonymous seed.
  await request("GET", "/autopilot");
});

afterEach(async () => {
  vi.useRealTimers();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("GET /autopilot", () => {
  it("rejects callers without an authenticated, entitled session", async () => {
    const res = await fetch(`${baseUrl}/autopilot`);
    expect(res.status).toBe(401);
  });

  it("returns a schema-valid snapshot with the seeded roster and boot logs", async () => {
    const { status, body } = await request("GET", "/autopilot");
    expect(status).toBe(200);
    expect(() => GetAutopilotResponse.parse(body)).not.toThrow();
    expect(body.masterActive).toBe(true);
    expect(body.todayPnl).toBe(0);
    expect(body.bots).toHaveLength(4);
    expect(body.bots.map((b: any) => b.id)).toContain("scalp-oracle");
    expect(body.logs.map((l: any) => l.text)).toEqual([
      "[SYS] TradiQs AutoPilot core initialized",
      "[SYS] 2 algorithms deployed — monitoring 14 markets",
    ]);
  });

  it("lazily accrues P&L and log lines for elapsed ticks while running", async () => {
    vi.setSystemTime(Date.now() + 10 * TICK_MS);
    const { body } = await request("GET", "/autopilot");
    expect(body.todayPnl).not.toBe(0);
    // 2 boot logs + 10 simulated tick logs
    expect(body.logs).toHaveLength(12);
    // Idempotent when no further time passes.
    const again = await request("GET", "/autopilot");
    expect(again.body.todayPnl).toBe(body.todayPnl);
    expect(again.body.logs).toHaveLength(12);
  });

  it("caps catch-up simulation after long idle periods", async () => {
    vi.setSystemTime(Date.now() + 10_000 * TICK_MS);
    const { body } = await request("GET", "/autopilot");
    // 80-line log ring buffer, and only 200 ticks of P&L accrued.
    expect(body.logs).toHaveLength(80);
    expect(Math.abs(body.todayPnl)).toBeLessThan(10_000);
  });

  it("resets today's P&L at the start of a new day", async () => {
    vi.setSystemTime(Date.now() + 10 * TICK_MS);
    // Pause the system so no new P&L accrues after the reset.
    const paused = await request("PUT", "/autopilot/master", { active: false });
    expect(paused.body.todayPnl).not.toBe(0);

    vi.setSystemTime(new Date("2026-08-06T09:00:00"));
    const { body } = await request("GET", "/autopilot");
    expect(body.todayPnl).toBe(0);
  });

  it("does not accrue P&L while the master switch is off", async () => {
    await request("PUT", "/autopilot/master", { active: false });
    const before = await request("GET", "/autopilot");
    vi.setSystemTime(Date.now() + 20 * TICK_MS);
    const after = await request("GET", "/autopilot");
    expect(after.body.todayPnl).toBe(before.body.todayPnl);
    expect(after.body.logs).toHaveLength(before.body.logs.length);
  });

  it("does not accrue P&L when no bots are running", async () => {
    for (const id of ["scalp-oracle", "breakout-engine"]) {
      await request("PUT", `/autopilot/bots/${id}`, { running: false });
    }
    vi.setSystemTime(Date.now() + 20 * TICK_MS);
    const { body } = await request("GET", "/autopilot");
    expect(body.todayPnl).toBe(0);
  });
});

describe("GET /autopilot/history", () => {
  it("records the finished day's P&L to history on rollover", async () => {
    vi.setSystemTime(Date.now() + 10 * TICK_MS);
    const paused = await request("PUT", "/autopilot/master", { active: false });
    const finishedPnl = paused.body.todayPnl;
    expect(finishedPnl).not.toBe(0);

    // No history before the rollover.
    const empty = await request("GET", "/autopilot/history");
    expect(empty.status).toBe(200);
    expect(empty.body.days).toEqual([]);

    vi.setSystemTime(new Date("2026-08-06T09:00:00"));
    const { status, body } = await request("GET", "/autopilot/history");
    expect(status).toBe(200);
    expect(() => GetAutopilotHistoryResponse.parse(body)).not.toThrow();
    expect(body.days).toEqual([{ day: "2026-08-05", pnl: finishedPnl }]);

    // The recorded day was persisted (the endpoint awaits the pending
    // history write before responding).
    expect([...historyRows.values()]).toEqual([
      {
        userId: "test-pro-user",
        day: "Wed Aug 05 2026",
        dayIso: "2026-08-05",
        pnl: finishedPnl,
      },
    ]);
  });

  it("restores persisted history after a restart", async () => {
    historyRows.set("test-pro-user:2026-08-03", {
      userId: "test-pro-user",
      day: "Mon Aug 03 2026",
      dayIso: "2026-08-03",
      pnl: -12.5,
    });
    historyRows.set("test-pro-user:2026-08-04", {
      userId: "test-pro-user",
      day: "Tue Aug 04 2026",
      dayIso: "2026-08-04",
      pnl: 88.25,
    });
    // Fresh module instance = simulated server restart; the mocked db rows
    // survive because they live in the enclosing test scope.
    vi.resetModules();
    const { createAutopilotRouter } = await import("./autopilot");
    const app = express();
    app.use(express.json());
    app.use(
      createAutopilotRouter(
        async (token) => (token === "test-pro" ? "test-pro-user" : null),
        async () => "pro",
        (_req, _res, next) => next(),
      ),
    );
    const restarted = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const { address, port } = restarted.address() as AddressInfo;
      const res = await fetch(`http://${address}:${port}/autopilot/history`, {
        headers: { authorization: "Bearer test-pro" },
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      // Most recent first.
      expect(body.days).toEqual([
        { day: "2026-08-04", pnl: 88.25 },
        { day: "2026-08-03", pnl: -12.5 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        restarted.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

describe("PUT /autopilot/master", () => {
  it("pauses and resumes the system, logging each transition", async () => {
    const paused = await request("PUT", "/autopilot/master", { active: false });
    expect(paused.status).toBe(200);
    expect(paused.body.masterActive).toBe(false);
    expect(paused.body.logs.at(-1).text).toBe(
      "[SYS] AutoPilot paused — halting new entries",
    );

    const resumed = await request("PUT", "/autopilot/master", { active: true });
    expect(resumed.body.masterActive).toBe(true);
    expect(resumed.body.logs.at(-1).text).toBe(
      "[SYS] AutoPilot resumed — all bots re-armed",
    );
  });

  it("rejects invalid bodies with 400", async () => {
    for (const bad of [{}, { active: "yes" }, { active: 1 }]) {
      const { status, body } = await request("PUT", "/autopilot/master", bad);
      expect(status).toBe(400);
      expect(body).toEqual({ error: "Invalid request body" });
    }
    // State untouched.
    const { body } = await request("GET", "/autopilot");
    expect(body.masterActive).toBe(true);
  });
});

describe("PUT /autopilot/bots/:botId", () => {
  it("returns 404 for an unknown bot", async () => {
    const { status, body } = await request("PUT", "/autopilot/bots/nope", {
      running: true,
    });
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Unknown bot" });
  });

  it("rejects invalid bodies with 400", async () => {
    for (const bad of [
      { running: "yes" },
      { capital: "10000" },
      { drawdown: "10" },
    ]) {
      const { status } = await request(
        "PUT",
        "/autopilot/bots/scalp-oracle",
        bad,
      );
      expect(status).toBe(400);
    }
  });

  it("updates capital and drawdown and logs the reconfiguration", async () => {
    const { status, body } = await request("PUT", "/autopilot/bots/grid-matrix", {
      capital: 25000,
      drawdown: 20,
    });
    expect(status).toBe(200);
    const bot = body.bots.find((b: any) => b.id === "grid-matrix");
    expect(bot.capital).toBe(25000);
    expect(bot.drawdown).toBe(20);
    expect(bot.running).toBe(false); // unchanged
    expect(body.logs.at(-1).text).toBe(
      "[CFG] Grid Matrix AI reconfigured — $25,000 capital, 20% max drawdown",
    );
  });

  it("starts and stops a bot, logging each transition", async () => {
    const started = await request("PUT", "/autopilot/bots/grid-matrix", {
      running: true,
    });
    expect(
      started.body.bots.find((b: any) => b.id === "grid-matrix").running,
    ).toBe(true);
    expect(started.body.logs.at(-1).text).toContain(
      "[BOT] Grid Matrix AI initialized",
    );

    const stopped = await request("PUT", "/autopilot/bots/grid-matrix", {
      running: false,
    });
    expect(
      stopped.body.bots.find((b: any) => b.id === "grid-matrix").running,
    ).toBe(false);
    expect(stopped.body.logs.at(-1).text).toBe(
      "[BOT] Grid Matrix AI stopped — open positions managed to close",
    );
  });

  it("does not log a transition when running is unchanged", async () => {
    const before = await request("GET", "/autopilot");
    const { body } = await request("PUT", "/autopilot/bots/grid-matrix", {
      running: false, // already stopped
    });
    expect(body.logs).toHaveLength(before.body.logs.length);
  });
});

describe("DELETE /autopilot/logs", () => {
  it("clears the log buffer without touching other state", async () => {
    vi.setSystemTime(Date.now() + 5 * TICK_MS);
    const { status, body } = await request("DELETE", "/autopilot/logs");
    expect(status).toBe(200);
    expect(body.logs).toEqual([]);
    expect(body.masterActive).toBe(true);
    expect(body.todayPnl).not.toBe(0); // P&L accrual survives the clear

    // New log lines accumulate again afterwards.
    const paused = await request("PUT", "/autopilot/master", { active: false });
    expect(paused.body.logs).toHaveLength(1);
  });
});

// ---- Per-user state isolation -------------------------------------------

// Fake verifier: token "token-<id>" resolves to user "<id>"; anything else
// is rejected as invalid.
const verifier = async (token: string) =>
  token.startsWith("token-") ? token.slice(6) : null;

// ---- Pro-only bot enforcement --------------------------------------------

describe("Pro-only bot enforcement", () => {
  let proServer: Server;
  let proBase: string;
  /** Tiers keyed by user id, seeded per test. */
  let tiers: Map<string, string | null>;
  /** Set when the tier lookup should throw (simulating Supabase failure). */
  let lookupFails: boolean;

  beforeEach(async () => {
    tiers = new Map();
    lookupFails = false;
    const { createAutopilotRouter } = await import("./autopilot");
    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      createAutopilotRouter(verifier, async (userId) => {
        if (lookupFails) throw new Error("supabase unavailable");
        return tiers.get(userId) ?? null;
      }),
    );
    await new Promise<void>((resolve) => {
      proServer = app.listen(0, "127.0.0.1", () => resolve());
    });
    const { address, port } = proServer.address() as AddressInfo;
    proBase = `http://${address}:${port}/api`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      proServer.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function put(
    path: string,
    body: unknown,
    token?: string,
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${proBase}${path}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  async function callAutopilot(
    method: "GET" | "PUT" | "DELETE",
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${proBase}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  }

  async function botFor(token: string, botId: string) {
    const userId = await verifier(token);
    const originalTier = userId ? tiers.get(userId) : undefined;
    if (userId) tiers.set(userId, "pro");
    try {
      const res = await fetch(`${proBase}/autopilot`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as any;
      return body.bots.find((b: any) => b.id === botId);
    } finally {
      if (!userId) return;
      if (originalTier === undefined) tiers.delete(userId);
      else tiers.set(userId, originalTier);
    }
  }

  it("blocks a free user from starting the Pro-only bot", async () => {
    tiers.set("free-user", "free");
    const { status, body } = await put(
      "/autopilot/bots/quantum-inst",
      { running: true },
      "token-free-user",
    );
    expect(status).toBe(403);
    expect(body.code).toBe("pro_subscription_required");
    // The rejection must not have started the bot.
    expect((await botFor("token-free-user", "quantum-inst")).running).toBe(
      false,
    );
  });

  it("persists allowed market preferences and rejects restricted asset requests", async () => {
    tiers.set("pro-user", "pro");
    let result = await put(
      "/autopilot/asset",
      { asset: "Crypto" },
      "token-pro-user",
    );
    expect(result.status).toBe(200);
    expect(result.body.selectedAsset).toBe("Crypto");

    result = await put(
      "/autopilot/asset",
      { asset: "Stocks" },
      "token-pro-user",
    );
    expect(result.status).toBe(403);
    expect(result.body.error).toMatch(/Elite tier/i);

    tiers.set("elite-user", "elite");
    result = await put(
      "/autopilot/asset",
      { asset: "Stocks" },
      "token-elite-user",
    );
    expect(result.status).toBe(200);
    expect(result.body.selectedAsset).toBe("Stocks");
  });

  it("removes a persisted Stocks preference immediately after an Elite downgrade", async () => {
    tiers.set("asset-lapsing-user", "elite");
    let result = await put(
      "/autopilot/asset",
      { asset: "Stocks" },
      "token-asset-lapsing-user",
    );
    expect(result.status).toBe(200);
    expect(result.body.selectedAsset).toBe("Stocks");

    // A subsequent read represents both a restored state after restart and
    // normal background polling: neither may retain Elite-only execution.
    tiers.set("asset-lapsing-user", "pro");
    const res = await fetch(`${proBase}/autopilot`, {
      headers: { authorization: "Bearer token-asset-lapsing-user" },
    });
    result = { status: res.status, body: (await res.json()) as any };
    expect(result.status).toBe(200);
    expect(result.body.selectedAsset).toBe("Forex");
    expect(result.body.logs.at(-1).text).toMatch(/Stocks execution market removed/i);
  });

  it("rejects a free user's asset preference replay", async () => {
    tiers.set("free-user", "free");
    const { status, body } = await put(
      "/autopilot/asset",
      { asset: "Forex" },
      "token-free-user",
    );
    expect(status).toBe(403);
    expect(body.error).toMatch(/Pro or Elite subscription/i);
  });

  it("blocks a free user from reconfiguring the Pro-only bot", async () => {
    tiers.set("free-user", "free");
    const { status } = await put(
      "/autopilot/bots/quantum-inst",
      { capital: 999_999 },
      "token-free-user",
    );
    expect(status).toBe(403);
    expect((await botFor("token-free-user", "quantum-inst")).capital).toBe(
      10000,
    );
  });

  it("blocks anonymous callers from the Pro-only bot", async () => {
    const { status, body } = await put("/autopilot/bots/quantum-inst", {
      running: true,
    });
    expect(status).toBe(401);
    expect(body.error).toMatch(/sign in/i);
  });

  it("allows a Pro user to start the Pro-only bot", async () => {
    tiers.set("pro-user", "pro");
    const { status, body } = await put(
      "/autopilot/bots/quantum-inst",
      { running: true },
      "token-pro-user",
    );
    expect(status).toBe(200);
    expect(body.bots.find((b: any) => b.id === "quantum-inst").running).toBe(
      true,
    );
  });

  it("accepts elite and whale tiers, case-insensitively", async () => {
    for (const [user, tier] of [
      ["elite-user", "Elite"],
      ["whale-user", "WHALE"],
    ] as const) {
      tiers.set(user, tier);
      const { status } = await put(
        "/autopilot/bots/quantum-inst",
        { running: true },
        `token-${user}`,
      );
      expect(status).toBe(200);
    }
  });

  it("lets a free user run one non-Pro bot but blocks a second concurrent bot", async () => {
    tiers.set("free-user", "free");
    // Seeded defaults boot with two free bots running; the first read trims
    // the account to the free-tier limit of one.
    const initial = await callAutopilot("GET", "/autopilot", "token-free-user");
    expect(initial.status).toBe(200);
    const runningFree = initial.body.bots.filter(
      (b: any) => !b.proOnly && b.running,
    );
    expect(runningFree).toHaveLength(1);

    // Stopping the remaining bot and starting a different one is free.
    const stopped = await put(
      "/autopilot/bots/scalp-oracle",
      { running: false },
      "token-free-user",
    );
    expect(stopped.status).toBe(200);
    const started = await put(
      "/autopilot/bots/grid-matrix",
      { running: true },
      "token-free-user",
    );
    expect(started.status).toBe(200);
    expect((await botFor("token-free-user", "grid-matrix")).running).toBe(true);

    // A second concurrent bot is rejected without changing state.
    const second = await put(
      "/autopilot/bots/breakout-engine",
      { running: true },
      "token-free-user",
    );
    expect(second.status).toBe(403);
    expect(second.body.code).toBe("pro_subscription_required");
    expect((await botFor("token-free-user", "breakout-engine")).running).toBe(
      false,
    );

    // Reconfiguring the bot they already run stays free.
    const reconfig = await put(
      "/autopilot/bots/grid-matrix",
      { capital: 5000, drawdown: 5 },
      "token-free-user",
    );
    expect(reconfig.status).toBe(200);
    expect((await botFor("token-free-user", "grid-matrix")).capital).toBe(5000);
  });

  it("rejects concurrent free-bot starts racing across separate API instances", async () => {
    tiers.set("racer-user", "free");
    // Open the free slot: read once (trims seeded defaults to one running),
    // then stop that bot so zero are running and every row is persisted.
    const first = await callAutopilot("GET", "/autopilot", "token-racer-user");
    expect(first.status).toBe(200);
    const stopped = await put(
      "/autopilot/bots/scalp-oracle",
      { running: false },
      "token-racer-user",
    );
    expect(stopped.status).toBe(200);

    // A second router instance simulates a second API process: fresh
    // in-memory state, same persisted rows.
    vi.resetModules();
    const { createAutopilotRouter } = await import("./autopilot");
    const otherApp = express();
    otherApp.use(express.json());
    otherApp.use(
      "/api",
      createAutopilotRouter(
        verifier,
        async (userId) => tiers.get(userId) ?? null,
      ),
    );
    const otherServer = await new Promise<Server>((resolve) => {
      const instance = otherApp.listen(0, "127.0.0.1", () => resolve(instance));
    });

    try {
      const { address, port } = otherServer.address() as AddressInfo;
      const otherBase = `http://${address}:${port}/api`;
      const startOn = (base: string, botId: string) =>
        fetch(`${base}/autopilot/bots/${botId}`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer token-racer-user",
          },
          body: JSON.stringify({ running: true }),
        }).then(async (res) => res.status);

      // Each instance sees zero running bots in its own memory; only the
      // database-atomic claim may win.
      const statuses = (
        await Promise.all([
          startOn(proBase, "grid-matrix"),
          startOn(otherBase, "breakout-engine"),
        ])
      ).sort();
      expect(statuses).toEqual([200, 403]);
      const runningRows = [...botRows.values()].filter(
        (row) => row.userId === "racer-user" && row.running === true,
      );
      expect(runningRows).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        otherServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("denies access when the tier lookup fails (fails closed)", async () => {
    tiers.set("pro-user", "pro");
    lookupFails = true;
    const { status } = await put(
      "/autopilot/bots/quantum-inst",
      { running: true },
      "token-pro-user",
    );
    expect(status).toBe(403);
  });

  it("denies access when the user has no profile row", async () => {
    const { status } = await put(
      "/autopilot/bots/quantum-inst",
      { running: true },
      "token-ghost-user",
    );
    expect(status).toBe(403);
  });

  it("still returns 404 for unknown bot ids after paid access is verified", async () => {
    tiers.set("pro-user", "pro");
    const { status } = await put(
      "/autopilot/bots/nope",
      { running: true },
      "token-pro-user",
    );
    expect(status).toBe(404);
  });

  it("lets free and Starter users read state while paid controls stay gated", async () => {
    for (const tier of ["free", "starter"] as const) {
      const userId = `${tier}-mixed-routes`;
      tiers.set(userId, tier);
      const token = `token-${userId}`;

      // Reads, free-bot control within the limit, and log clearing work.
      for (const [method, path, body] of [
        ["GET", "/autopilot", undefined],
        ["GET", "/autopilot/history", undefined],
        ["PUT", "/autopilot/bots/scalp-oracle", { running: false }],
        ["DELETE", "/autopilot/logs", undefined],
      ] as const) {
        const result = await callAutopilot(method, path, token, body);
        expect(result.status, `${tier} ${method} ${path}`).toBe(200);
      }

      // Engine-level controls and Pro-only bots stay paid-only.
      for (const [method, path, body] of [
        ["PUT", "/autopilot/master", { active: false }],
        ["PUT", "/autopilot/asset", { asset: "Forex" }],
        ["PUT", "/autopilot/bots/quantum-inst", { running: true }],
      ] as const) {
        const result = await callAutopilot(method, path, token, body);
        expect(result.status, `${tier} ${method} ${path}`).toBe(403);
        expect(result.body.code).toBe("pro_subscription_required");
      }
    }
  });

  it("rejects unresolved-tier users from every AutoPilot route", async () => {
    const userId = "unresolved-all-routes";
    for (const [method, path, body] of [
      ["GET", "/autopilot", undefined],
      ["GET", "/autopilot/history", undefined],
      ["PUT", "/autopilot/master", { active: false }],
      ["PUT", "/autopilot/asset", { asset: "Forex" }],
      ["PUT", "/autopilot/bots/grid-matrix", { running: true }],
      ["DELETE", "/autopilot/logs", undefined],
    ] as const) {
      const result = await callAutopilot(method, path, `token-${userId}`, body);
      expect(result.status, `unresolved ${method} ${path}`).toBe(403);
      expect(result.body.code).toBe("pro_subscription_required");
    }
    expect(stateRows.has(userId)).toBe(false);
    expect(
      [...botRows.values()].some((row) => row.userId === userId),
    ).toBe(false);
  });

  it("rejects anonymous callers from every AutoPilot route", async () => {
    const routes = [
      ["GET", "/autopilot"],
      ["GET", "/autopilot/history"],
      ["PUT", "/autopilot/master", { active: false }],
      ["PUT", "/autopilot/asset", { asset: "Forex" }],
      ["PUT", "/autopilot/bots/grid-matrix", { running: true }],
      ["DELETE", "/autopilot/logs"],
    ] as const;

    for (const [method, path, body] of routes) {
      const result = await callAutopilot(method, path, undefined, body);
      expect(result.status, `${method} ${path}`).toBe(401);
    }
  });

  it("revokes persisted privileged state after an API-process restart", async () => {
    tiers.set("restart-user", "elite");
    let result = await put(
      "/autopilot/asset",
      { asset: "Stocks" },
      "token-restart-user",
    );
    expect(result.status).toBe(200);
    result = await put(
      "/autopilot/bots/quantum-inst",
      { running: true },
      "token-restart-user",
    );
    expect(result.status).toBe(200);

    tiers.set("restart-user", "free");
    vi.resetModules();
    const { createAutopilotRouter } = await import("./autopilot");
    const restartedApp = express();
    restartedApp.use(express.json());
    restartedApp.use(
      "/api",
      createAutopilotRouter(verifier, async (userId) => tiers.get(userId) ?? null),
    );
    const restartedServer = await new Promise<Server>((resolve) => {
      const instance = restartedApp.listen(0, "127.0.0.1", () => resolve(instance));
    });

    try {
      const { address, port } = restartedServer.address() as AddressInfo;
      const restartedBase = `http://${address}:${port}/api`;
      // Free users may read state again — but the first touch in the new
      // process must still revoke both persisted privileged settings.
      let res = await fetch(`${restartedBase}/autopilot`, {
        headers: { authorization: "Bearer token-restart-user" },
      });
      expect(res.status).toBe(200);
      const freeBody = (await res.json()) as any;
      expect(freeBody.selectedAsset).toBe("Forex");
      expect(
        freeBody.bots.find((bot: any) => bot.id === "quantum-inst").running,
      ).toBe(false);

      // Re-checking through the paid path confirms the revocation persisted.
      tiers.set("restart-user", "pro");
      res = await fetch(`${restartedBase}/autopilot`, {
        headers: { authorization: "Bearer token-restart-user" },
      });
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.selectedAsset).toBe("Forex");
      expect(
        body.bots.find((bot: any) => bot.id === "quantum-inst").running,
      ).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        restartedServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  // A user who pays, starts the Pro bot, then lapses must not keep it
  // running. The start-time check alone would let it run forever.
  describe("entitlement loss after the bot is already running", () => {
    async function startProBotAsPaidUser(token = "token-lapsing-user") {
      tiers.set("lapsing-user", "pro");
      const { status } = await put(
        "/autopilot/bots/quantum-inst",
        { running: true },
        token,
      );
      expect(status).toBe(200);
      expect((await botFor(token, "quantum-inst")).running).toBe(true);
    }

    it("does not expose a running Pro bot after a downgrade", async () => {
      await startProBotAsPaidUser();

      tiers.set("lapsing-user", "free"); // subscription lapses
      const res = await fetch(`${proBase}/autopilot`, {
        headers: { authorization: "Bearer token-lapsing-user" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(
        body.bots.find((bot: any) => bot.id === "quantum-inst").running,
      ).toBe(false);
    });

    it("stops the Pro bot's activity after a downgrade", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      const res = await fetch(`${proBase}/autopilot`, {
        headers: { authorization: "Bearer token-lapsing-user" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(
        body.bots.find((bot: any) => bot.id === "quantum-inst").running,
      ).toBe(false);
      expect(
        body.logs.some((l: any) => /Elite subscription required/.test(l.text)),
      ).toBe(true);
    });

    it("does not let the master toggle resurrect the Pro bot", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      // Pause and re-arm the whole system.
      await put("/autopilot/master", { active: false }, "token-lapsing-user");
      const { status, body } = await put(
        "/autopilot/master",
        { active: true },
        "token-lapsing-user",
      );
      expect(status).toBe(403);
      expect(body.error).toMatch(/requires a Pro or Elite subscription/i);
    });

    it("fails closed when the tier lookup starts failing", async () => {
      await startProBotAsPaidUser();
      lookupFails = true; // e.g. Supabase outage -- must fail closed
      const res = await fetch(`${proBase}/autopilot`, {
        headers: { authorization: "Bearer token-lapsing-user" },
      });
      expect(res.status).toBe(403);
    });

    it("leaves the bot running while the user is still entitled", async () => {
      await startProBotAsPaidUser();
      // No tier change.
      expect(
        (await botFor("token-lapsing-user", "quantum-inst")).running,
      ).toBe(true);
    });

    it("stops the Pro bot even when the request targets a FREE bot", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      // Touching an unrelated free bot advances the simulation, so it must
      // revoke first rather than ticking the lapsed Pro bot forward.
      const { status } = await put(
        "/autopilot/bots/grid-matrix",
        { running: true },
        "token-lapsing-user",
      );
      expect(status).toBe(403);
      expect(
        (await botFor("token-lapsing-user", "quantum-inst")).running,
      ).toBe(false);
      expect(
        (await botFor("token-lapsing-user", "grid-matrix")).running,
      ).toBe(false);
    });

    it("lets lapsed users stop their revoked Pro bot", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      // Stopping is always allowed — a user must be able to switch off
      // something they can no longer afford — and revocation has already
      // stopped the bot by the time the request is handled.
      const { status } = await put(
        "/autopilot/bots/quantum-inst",
        { running: false },
        "token-lapsing-user",
      );
      expect(status).toBe(200);
      expect(
        (await botFor("token-lapsing-user", "quantum-inst")).running,
      ).toBe(false);
    });

    it("still refuses to (re)start the Pro bot after lapsing", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      const { status } = await put(
        "/autopilot/bots/quantum-inst",
        { running: true },
        "token-lapsing-user",
      );
      expect(status).toBe(403);
      // ...and the rejected request still left the bot stopped.
      expect(
        (await botFor("token-lapsing-user", "quantum-inst")).running,
      ).toBe(false);
    });

    // Every endpoint that advances the simulation must revoke first,
    // otherwise a lapsed user keeps accruing Pro P&L by polling that one.
    it("revokes before serving history after a downgrade", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      const res = await fetch(`${proBase}/autopilot/history`, {
        headers: { authorization: "Bearer token-lapsing-user" },
      });
      expect(res.status).toBe(200);
      expect(
        (await botFor("token-lapsing-user", "quantum-inst")).running,
      ).toBe(false);
    });

    it("stops the Pro bot when only logs are cleared", async () => {
      await startProBotAsPaidUser();
      tiers.set("lapsing-user", "free");

      const res = await fetch(`${proBase}/autopilot/logs`, {
        method: "DELETE",
        headers: { authorization: "Bearer token-lapsing-user" },
      });
      expect(res.status).toBe(200);
      expect(
        (await botFor("token-lapsing-user", "quantum-inst")).running,
      ).toBe(false);
    });

    it("leaves free bots running after a downgrade", async () => {
      tiers.set("lapsing-user", "pro");
      await put(
        "/autopilot/bots/grid-matrix",
        { running: true },
        "token-lapsing-user",
      );
      tiers.set("lapsing-user", "free");
      expect(
        (await botFor("token-lapsing-user", "grid-matrix")).running,
      ).toBe(true);
    });
  });
});

describe("autopilot per-user state", () => {
  let authServer: Server;
  let authBase: string;

  beforeEach(async () => {
    // Reuse the same fresh module instance loaded by the file-level
    // beforeEach so this suite gets its own clean per-user store too.
    const { createAutopilotRouter } = await import("./autopilot");
    const app = express();
    app.use(express.json());
    app.use("/api", createAutopilotRouter(verifier, async () => "pro"));
    await new Promise<void>((resolve) => {
      authServer = app.listen(0, "127.0.0.1", () => resolve());
    });
    const { address, port } = authServer.address() as AddressInfo;
    authBase = `http://${address}:${port}/api`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      authServer.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function call(
    path: string,
    {
      method = "GET",
      token,
      body,
    }: { method?: string; token?: string; body?: unknown } = {},
  ) {
    const res = await fetch(`${authBase}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  it("keeps two users' bot configurations independent", async () => {
    // Alice stops a bot and reconfigures capital.
    const alice = await call("/autopilot/bots/scalp-oracle", {
      method: "PUT",
      token: "token-alice",
      body: { running: false, capital: 25000 },
    });
    expect(alice.status).toBe(200);
    const aliceBot = alice.body.bots.find((b: any) => b.id === "scalp-oracle");
    expect(aliceBot).toMatchObject({ running: false, capital: 25000 });

    // Bob still sees the defaults.
    const bob = await call("/autopilot", { token: "token-bob" });
    expect(bob.status).toBe(200);
    const bobBot = bob.body.bots.find((b: any) => b.id === "scalp-oracle");
    expect(bobBot).toMatchObject({ running: true, capital: 10000 });
  });

  it("scopes the master switch and logs per user", async () => {
    const alice = await call("/autopilot/master", {
      method: "PUT",
      token: "token-alice2",
      body: { active: false },
    });
    expect(alice.body.masterActive).toBe(false);

    const bob = await call("/autopilot", { token: "token-bob2" });
    expect(bob.body.masterActive).toBe(true);

    // Alice clears her logs; Bob keeps his.
    const cleared = await call("/autopilot/logs", {
      method: "DELETE",
      token: "token-alice2",
    });
    expect(cleared.body.logs).toHaveLength(0);
    const bobAgain = await call("/autopilot", { token: "token-bob2" });
    expect(bobAgain.body.logs.length).toBeGreaterThan(0);
  });

  it("rejects unauthenticated callers instead of returning shared state", async () => {
    const first = await call("/autopilot");
    expect(first.status).toBe(401);

    // ...and a signed-in user is unaffected by anonymous changes.
    const carol = await call("/autopilot", { token: "token-carol" });
    const carolBot = carol.body.bots.find((b: any) => b.id === "grid-matrix");
    expect(carolBot.running).toBe(false);
  });

  it("rejects invalid tokens with 401", async () => {
    const res = await call("/autopilot", { token: "garbage" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("scopes P&L history per user on rollover", async () => {
    // Seed Alice's state, let ticks elapse, then pause to freeze her P&L.
    await call("/autopilot", { token: "token-alice3" });
    vi.setSystemTime(Date.now() + 10 * TICK_MS);
    const alice = await call("/autopilot/master", {
      method: "PUT",
      token: "token-alice3",
      body: { active: false },
    });
    const alicePnl = alice.body.todayPnl;
    expect(alicePnl).not.toBe(0);
    // Bob's state exists but he pauses immediately, so his day finishes ~0.
    await call("/autopilot/master", {
      method: "PUT",
      token: "token-bob3",
      body: { active: false },
    });

    vi.setSystemTime(new Date("2026-08-06T09:00:00"));
    const aliceHistory = await call("/autopilot/history", {
      token: "token-alice3",
    });
    expect(aliceHistory.status).toBe(200);
    expect(aliceHistory.body.days).toEqual([
      { day: "2026-08-05", pnl: alicePnl },
    ]);

    const bobHistory = await call("/autopilot/history", {
      token: "token-bob3",
    });
    expect(bobHistory.body.days).toHaveLength(1);
    expect(bobHistory.body.days[0]!.pnl).not.toBe(alicePnl);
  });
});

// ---- History assurance policy --------------------------------------------

/**
 * These tests verify that GET /autopilot/history uses the "soft" AAL2
 * assurance policy: transient service unavailability passes through while
 * a definitive MFA requirement is still enforced.
 */
describe("GET /autopilot/history assurance policy", () => {
  /** Controls what the fake AAL2 assurance middleware returns. */
  type AssuranceResult = "ok" | "mfa_required" | "service_unavailable" | "network_error";
  let assuranceResult: AssuranceResult;

  let assuranceServer: Server;
  let assuranceBase: string;

  beforeEach(async () => {
    assuranceResult = "ok";

    const { createAutopilotRouter } = await import("./autopilot");
    const app = express();
    app.use(express.json());

    // Strict assurance for write endpoints (simulates the production default).
    const strictAssurance: import("express").RequestHandler = (_req, res, next) => {
      if (assuranceResult === "ok") return next();
      if (assuranceResult === "mfa_required") {
        res.status(403).json({ error: "Two-factor verification is required for this action." });
        return;
      }
      if (assuranceResult === "service_unavailable") {
        res.status(503).json({ error: "Unable to verify account security." });
        return;
      }
      // network_error
      next(new Error("Simulated network failure"));
    };

    // Soft assurance for the history read endpoint (simulates requireAal2IfMfaEnrolledSoft).
    const softAssurance: import("express").RequestHandler = (_req, res, next) => {
      if (assuranceResult === "ok") return next();
      if (assuranceResult === "mfa_required") {
        res.status(403).json({ error: "Two-factor verification is required to view this.", code: "mfa_required" });
        return;
      }
      // service_unavailable and network_error both pass through in the soft variant.
      next();
    };

    app.use(
      "/api",
      createAutopilotRouter(verifier, async () => "pro", strictAssurance, softAssurance),
    );
    await new Promise<void>((resolve) => {
      assuranceServer = app.listen(0, "127.0.0.1", () => resolve());
    });
    const { address, port } = assuranceServer.address() as AddressInfo;
    assuranceBase = `http://${address}:${port}/api`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      assuranceServer.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function historyFor(token?: string): Promise<{ status: number; body: any }> {
    const res = await fetch(`${assuranceBase}/autopilot/history`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: await res.json() };
  }

  it("serves history to a signed-in user when assurance is available", async () => {
    assuranceResult = "ok";
    const { status, body } = await historyFor("token-user1");
    expect(status).toBe(200);
    expect(GetAutopilotHistoryResponse.safeParse(body).success).toBe(true);
  });

  it("serves history when the AAL assurance service is temporarily unavailable", async () => {
    // This is the core regression: a 503 from Supabase must not produce a
    // 503 to the client. Ordinary signed-in sessions should not be blocked.
    assuranceResult = "service_unavailable";
    const { status, body } = await historyFor("token-user2");
    expect(status).toBe(200);
    expect(GetAutopilotHistoryResponse.safeParse(body).success).toBe(true);
  });

  it("serves history when the AAL assurance network call fails", async () => {
    assuranceResult = "network_error";
    const { status, body } = await historyFor("token-user3");
    expect(status).toBe(200);
    expect(GetAutopilotHistoryResponse.safeParse(body).success).toBe(true);
  });

  it("returns 403 with mfa_required code when MFA verification is genuinely required", async () => {
    assuranceResult = "mfa_required";
    const { status, body } = await historyFor("token-user4");
    expect(status).toBe(403);
    expect(body.code).toBe("mfa_required");
  });

  it("rejects anonymous history callers even when soft assurance is unavailable", async () => {
    assuranceResult = "service_unavailable";
    const { status, body } = await historyFor(); // no token
    expect(status).toBe(401);
    expect(body.error).toMatch(/sign in/i);
  });

  it("write endpoints still fail when assurance service is unavailable (strict variant)", async () => {
    assuranceResult = "service_unavailable";
    const res = await fetch(`${assuranceBase}/autopilot/master`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer token-user5" },
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(503);
  });

  it("write endpoints still enforce MFA when required", async () => {
    assuranceResult = "mfa_required";
    const res = await fetch(`${assuranceBase}/autopilot/master`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer token-user6" },
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(403);
  });
});

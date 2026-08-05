import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GetAutopilotResponse } from "@workspace/api-zod";
import { db, autopilotBotsTable, autopilotStateTable } from "@workspace/db";

const TICK_MS = 2_600;

let server: Server;
let baseUrl: string;

async function startFreshApp(): Promise<void> {
  // The autopilot router keeps in-memory state at module scope; re-import a
  // fresh copy per test so cases don't leak state into each other.
  vi.resetModules();
  const { default: autopilotRouter } = await import("./autopilot");
  const app: Express = express();
  app.use(express.json());
  app.use(autopilotRouter);
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
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(async () => {
  // Only fake Date so real network/socket timers keep working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-05T10:00:00"));
  // Wipe persisted rows so each test starts from freshly seeded defaults.
  await db.delete(autopilotBotsTable);
  await db.delete(autopilotStateTable);
  await startFreshApp();
});

afterEach(async () => {
  vi.useRealTimers();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("GET /autopilot", () => {
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

describe("autopilot per-user state", () => {
  let authServer: Server;
  let authBase: string;

  beforeEach(async () => {
    // Reuse the same fresh module instance loaded by the file-level
    // beforeEach so this suite gets its own clean per-user store too.
    const { createAutopilotRouter } = await import("./autopilot");
    const app = express();
    app.use(express.json());
    app.use("/api", createAutopilotRouter(verifier));
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

  it("gives unauthenticated callers a shared anonymous state", async () => {
    const first = await call("/autopilot");
    expect(first.status).toBe(200);
    await call("/autopilot/bots/grid-matrix", {
      method: "PUT",
      body: { running: true },
    });
    const second = await call("/autopilot");
    const bot = second.body.bots.find((b: any) => b.id === "grid-matrix");
    expect(bot.running).toBe(true);

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
});

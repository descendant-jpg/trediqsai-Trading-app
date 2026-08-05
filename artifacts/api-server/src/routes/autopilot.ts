import { Router, type IRouter } from "express";
import {
  GetAutopilotResponse,
  SetAutopilotMasterBody,
  UpdateAutopilotBotBody,
} from "@workspace/api-zod";
import { db, autopilotBotsTable, autopilotStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type BotState = {
  id: string;
  name: string;
  tags: string;
  risk: "Low" | "Medium" | "High";
  winRate: string;
  return30d: string;
  totalTrades: number;
  proOnly: boolean;
  running: boolean;
  capital: number;
  drawdown: number;
};

type LogLine = { id: string; time: string; text: string };

const LOG_TEMPLATES = [
  "[SCAN] BTCUSD 5m — sweeping liquidity below 96,180…",
  "[EXEC] Limit order placed: XAUUSD BUY @ 2,411.80",
  "[RISK] Trailing stop adjusted +12p on EURUSD short",
  "[SCAN] Market structure shift detected on US30 M15",
  "[EXEC] Partial close 50% @ TP1 — GBPJPY +100p",
  "[GRID] Rebalancing grid levels: 27.20 → 27.85 (12 nodes)",
  "[RISK] Exposure check passed — 3.2% of allocated capital at risk",
  "[SCAN] Momentum spike on NAS100 — awaiting retest confirmation",
  "[EXEC] Stop moved to breakeven on ETHUSD long",
  "[NET] Latency 14ms — co-located feed stable",
];

const TICK_MS = 2_600;
const MAX_LOGS = 80;

const bots: BotState[] = [
  {
    id: "scalp-oracle",
    name: "Scalp Oracle AI",
    tags: "Crypto / 5m Scalper",
    risk: "Low",
    winRate: "78.4%",
    return30d: "+12.6%",
    totalTrades: 1842,
    proOnly: false,
    running: true,
    capital: 10000,
    drawdown: 10,
  },
  {
    id: "breakout-engine",
    name: "Breakout Engine Pro",
    tags: "Forex & Stocks / Momentum",
    risk: "Medium",
    winRate: "71.2%",
    return30d: "+9.1%",
    totalTrades: 967,
    proOnly: false,
    running: true,
    capital: 15000,
    drawdown: 15,
  },
  {
    id: "grid-matrix",
    name: "Grid Matrix AI",
    tags: "Range Trading",
    risk: "Low",
    winRate: "82.1%",
    return30d: "+7.4%",
    totalTrades: 2210,
    proOnly: false,
    running: false,
    capital: 10000,
    drawdown: 10,
  },
  {
    id: "quantum-inst",
    name: "Quantum Institutional AI",
    tags: "Multi-Asset / Order Flow",
    risk: "High",
    winRate: "88.7%",
    return30d: "+21.3%",
    totalTrades: 3405,
    proOnly: true,
    running: false,
    capital: 10000,
    drawdown: 10,
  },
];

function nowClock(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const state = {
  masterActive: true,
  todayPnl: 0,
  pnlDay: new Date().toDateString(),
  logs: [] as LogLine[],
  lastTickAt: Date.now(),
  logSeq: 0,
  templateIndex: 0,
};

function pushLog(text: string, atMs = Date.now()) {
  state.logSeq += 1;
  state.logs.push({ id: `l${state.logSeq}`, time: nowClock(atMs), text });
  if (state.logs.length > MAX_LOGS) {
    state.logs.splice(0, state.logs.length - MAX_LOGS);
  }
}

const STATE_ROW_ID = 1;
const PERSIST_INTERVAL_MS = 10_000;
let lastPersistAt = 0;

async function persistBot(bot: BotState): Promise<void> {
  await db
    .insert(autopilotBotsTable)
    .values({
      id: bot.id,
      running: bot.running,
      capital: bot.capital,
      drawdown: bot.drawdown,
    })
    .onConflictDoUpdate({
      target: autopilotBotsTable.id,
      set: { running: bot.running, capital: bot.capital, drawdown: bot.drawdown },
    });
}

async function persistState(): Promise<void> {
  const values = {
    id: STATE_ROW_ID,
    masterActive: state.masterActive,
    todayPnl: state.todayPnl,
    pnlDay: state.pnlDay,
    logs: state.logs,
    lastTickAt: state.lastTickAt,
    logSeq: state.logSeq,
    templateIndex: state.templateIndex,
  };
  await db
    .insert(autopilotStateTable)
    .values(values)
    .onConflictDoUpdate({
      target: autopilotStateTable.id,
      set: values,
    });
  lastPersistAt = Date.now();
}

/** Throttled background save so simulated P&L survives restarts too. */
function persistStateThrottled(): void {
  if (Date.now() - lastPersistAt < PERSIST_INTERVAL_MS) return;
  lastPersistAt = Date.now();
  persistState().catch((err) => {
    logger.error({ err }, "Failed to persist autopilot state");
  });
}

/**
 * Load persisted AutoPilot state on boot. Unknown bot rows are ignored;
 * missing rows fall back to the in-code defaults and are written on first
 * mutation. Failure to load is fatal for autopilot routes (readyPromise
 * rejects), so we surface errors instead of silently resetting state.
 */
async function loadPersistedState(): Promise<void> {
  const [botRows, stateRows] = await Promise.all([
    db.select().from(autopilotBotsTable),
    db
      .select()
      .from(autopilotStateTable)
      .where(eq(autopilotStateTable.id, STATE_ROW_ID)),
  ]);
  for (const row of botRows) {
    const bot = bots.find((b) => b.id === row.id);
    if (!bot) continue;
    bot.running = row.running;
    bot.capital = row.capital;
    bot.drawdown = row.drawdown;
  }
  const saved = stateRows[0];
  if (saved) {
    state.masterActive = saved.masterActive;
    state.todayPnl = saved.todayPnl;
    state.pnlDay = saved.pnlDay;
    state.logs = saved.logs;
    state.lastTickAt = Math.max(saved.lastTickAt, Date.now() - 60_000);
    state.logSeq = saved.logSeq;
    state.templateIndex = saved.templateIndex;
    pushLog("[SYS] AutoPilot state restored — resuming operations");
  } else {
    pushLog("[SYS] TradiQs AutoPilot core initialized");
    pushLog("[SYS] 2 algorithms deployed — monitoring 14 markets");
    await persistState();
  }
}

const readyPromise = loadPersistedState().catch((err) => {
  logger.error({ err }, "Failed to load persisted autopilot state");
  throw err;
});

// Hold requests until persisted state has been loaded.
router.use((_req, res, next) => {
  readyPromise.then(
    () => next(),
    () => res.status(503).json({ error: "AutoPilot state unavailable" }),
  );
});

/**
 * Advance the simulation lazily: while the system is active and at least one
 * bot runs, every elapsed tick produces a log line and a P&L increment that
 * scales with deployed capital. P&L resets at the start of each day.
 */
function advanceSimulation(): void {
  const now = Date.now();
  const today = new Date(now).toDateString();
  if (today !== state.pnlDay) {
    state.pnlDay = today;
    state.todayPnl = 0;
  }

  const runningBots = bots.filter((b) => b.running);
  if (!state.masterActive || runningBots.length === 0) {
    state.lastTickAt = now;
    return;
  }

  const deployed = runningBots.reduce((sum, b) => sum + b.capital, 0);
  const ticks = Math.min(
    Math.floor((now - state.lastTickAt) / TICK_MS),
    // Cap catch-up work after long idle periods.
    200,
  );
  for (let i = 0; i < ticks; i++) {
    const tickAt = state.lastTickAt + (i + 1) * TICK_MS;
    pushLog(
      LOG_TEMPLATES[state.templateIndex % LOG_TEMPLATES.length]!,
      tickAt,
    );
    state.templateIndex += 1;
    // Simulated per-tick P&L: mostly wins, occasional losses, sized to capital.
    const magnitude = deployed * 0.00012;
    const sign = state.templateIndex % 4 === 3 ? -0.6 : 1;
    const jitter = 0.5 + ((state.templateIndex * 7919) % 100) / 100;
    state.todayPnl += sign * magnitude * jitter;
  }
  if (ticks > 0) state.lastTickAt += ticks * TICK_MS;
}

function snapshot() {
  advanceSimulation();
  persistStateThrottled();
  return GetAutopilotResponse.parse({
    masterActive: state.masterActive,
    todayPnl: Math.round(state.todayPnl * 100) / 100,
    bots,
    logs: state.logs,
  });
}

router.get("/autopilot", (_req, res) => {
  res.json(snapshot());
});

router.put("/autopilot/master", async (req, res, next) => {
  const parsed = SetAutopilotMasterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  advanceSimulation();
  state.masterActive = parsed.data.active;
  state.lastTickAt = Date.now();
  pushLog(
    parsed.data.active
      ? "[SYS] AutoPilot resumed — all bots re-armed"
      : "[SYS] AutoPilot paused — halting new entries",
  );
  try {
    await persistState();
  } catch (err) {
    next(err);
    return;
  }
  res.json(snapshot());
});

router.put("/autopilot/bots/:botId", async (req, res, next) => {
  const bot = bots.find((b) => b.id === req.params["botId"]);
  if (!bot) {
    res.status(404).json({ error: "Unknown bot" });
    return;
  }
  const parsed = UpdateAutopilotBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  advanceSimulation();
  const { running, capital, drawdown } = parsed.data;
  if (capital !== undefined || drawdown !== undefined) {
    if (capital !== undefined) bot.capital = capital;
    if (drawdown !== undefined) bot.drawdown = drawdown;
    pushLog(
      `[CFG] ${bot.name} reconfigured — $${bot.capital.toLocaleString()} capital, ${bot.drawdown}% max drawdown`,
    );
  }
  if (running !== undefined && running !== bot.running) {
    bot.running = running;
    pushLog(
      running
        ? `[BOT] ${bot.name} initialized with $${bot.capital.toLocaleString()} capital allocation`
        : `[BOT] ${bot.name} stopped — open positions managed to close`,
    );
  }
  try {
    await persistBot(bot);
    await persistState();
  } catch (err) {
    next(err);
    return;
  }
  res.json(snapshot());
});

router.delete("/autopilot/logs", async (_req, res, next) => {
  advanceSimulation();
  state.logs = [];
  try {
    await persistState();
  } catch (err) {
    next(err);
    return;
  }
  res.json(snapshot());
});

export default router;

import { describe, expect, it } from "vitest";
import {
  SIGNAL_UNIVERSE,
  advanceSignal,
  buildSignalParts,
  mulberry32,
  normalizeEnvelope,
  realizedPips,
  type Instrument,
  type SignalEnvelope,
  type SignalState,
} from "./signalEngine";

const forex = SIGNAL_UNIVERSE.find((i) => i.symbol === "EUR/USD") as Instrument;
const gold = SIGNAL_UNIVERSE.find((i) => i.symbol === "XAU/USD") as Instrument;
const btc = SIGNAL_UNIVERSE.find((i) => i.symbol === "BTC/USD") as Instrument;
const nvda = SIGNAL_UNIVERSE.find((i) => i.symbol === "NVDA") as Instrument;

const seeded = (seed: number) => mulberry32(seed);

describe("buildSignalParts", () => {
  it("is deterministic for the same instrument and seed", () => {
    const a = buildSignalParts(btc, 67000, seeded(42));
    const b = buildSignalParts(btc, 67000, seeded(42));
    expect(a).toEqual(b);
  });

  it("builds BUY setups with SL below entry and ascending targets", () => {
    // rand: 0.1 → BUY, 0.9 → market entry (not pending), rest mid-stream
    const seq = [0.1, 0.9, 0.5, 0.5];
    let i = 0;
    const parts = buildSignalParts(forex, 1.085, () => seq[i++] ?? 0.5);
    expect(parts.direction).toBe("BUY");
    expect(parts.status).toBe("Active");
    expect(parts.stopLoss).toBeLessThan(parts.entry);
    expect(parts.targets).toHaveLength(3);
    expect(parts.targets[0]!.price).toBeGreaterThan(parts.entry);
    expect(parts.targets[2]!.price).toBeGreaterThan(parts.targets[1]!.price);
  });

  it("labels forex targets in pips, crypto in percent and stocks in dollars", () => {
    const fx = buildSignalParts(forex, 1.085, seeded(1));
    expect(fx.targets[0]!.label).toMatch(/^\+\d+p$/);
    const crypto = buildSignalParts(btc, 67000, seeded(1));
    expect(crypto.targets[0]!.label).toMatch(/^\+\d+\.\d%$/);
    const stock = buildSignalParts(nvda, 140, seeded(1));
    expect(stock.targets[0]!.label).toMatch(/^\+\$\d+\.\d{2}$/);
    const xau = buildSignalParts(gold, 2460, seeded(1));
    expect(xau.targets[0]!.label).toMatch(/^\+\d+p$/);
  });

  it("emits pending limits whose entry sits inside the market", () => {
    // rand: 0.1 → BUY, 0.1 (< 0.3) → pending limit below market
    const seq = [0.1, 0.1, 0.5, 0.5];
    let i = 0;
    const pending = buildSignalParts(forex, 1.085, () => seq[i++] ?? 0.5);
    expect(pending.direction).toBe("BUY");
    expect(pending.status).toBe("Pending");
    expect(pending.entry).toBeLessThan(1.085);
    expect(pending.confidence).toBeGreaterThanOrEqual(62);
    expect(pending.confidence).toBeLessThanOrEqual(92);
  });
});

function activeState(overrides: Partial<SignalState> = {}): SignalState {
  const envelope: SignalEnvelope = {
    version: 2,
    targets: [
      { id: 1, price: 110, pips: 100, label: "+100p", isHit: false, hitAt: null },
      { id: 2, price: 120, pips: 200, label: "+200p", isHit: false, hitAt: null },
      { id: 3, price: 132, pips: 320, label: "+320p", isHit: false, hitAt: null },
    ],
    analysis: "",
    confidence: 80,
    risk: "Low",
    timeframe: "H1",
    rr: "1:3.2",
    breakeven: false,
    openedAt: null,
    closedAt: null,
  };
  return { status: "Active", direction: "BUY", entry: 100, stopLoss: 90, envelope, ...overrides };
}

describe("advanceSignal", () => {
  const now = new Date("2026-08-25T12:00:00Z");

  it("activates a pending BUY when price drops to the entry", () => {
    const pending = activeState({ status: "Pending", entry: 95 });
    const { state, events } = advanceSignal(pending, 94.5, now);
    expect(state.status).toBe("Active");
    expect(state.envelope.openedAt).toBe(now.toISOString());
    expect(events).toEqual([{ type: "activated" }]);
  });

  it("marks TP hits in order and trails to break-even after TP1", () => {
    const { state, events } = advanceSignal(activeState(), 111, now);
    expect(state.envelope.targets[0]!.isHit).toBe(true);
    expect(state.envelope.targets[1]!.isHit).toBe(false);
    expect(state.envelope.breakeven).toBe(true);
    expect(events).toEqual([{ type: "tp_hit", tpId: 1 }, { type: "breakeven" }]);
  });

  it("closes Won when the break-even stop is touched after TP1", () => {
    const { state: hit } = advanceSignal(activeState(), 115, now);
    const { state, events } = advanceSignal(hit, 99.5, now);
    // SL at 90 untouched; but breakeven stop = entry 100 → touched at 99.5.
    expect(state.status).toBe("Won");
    expect(state.envelope.closedAt).toBe(now.toISOString());
    expect(events).toEqual([{ type: "closed", status: "Won" }]);
  });

  it("closes Lost when SL is hit before any target", () => {
    const { state, events } = advanceSignal(activeState(), 89, now);
    expect(state.status).toBe("Lost");
    expect(events).toEqual([{ type: "closed", status: "Lost" }]);
  });

  it("closes Won when all targets are hit", () => {
    const { state, events } = advanceSignal(activeState(), 135, now);
    expect(state.status).toBe("Won");
    expect(state.envelope.targets.every((tp) => tp.isHit)).toBe(true);
    expect(events.some((e) => e.type === "closed" && e.status === "Won")).toBe(true);
  });

  it("mirrors logic for SELL signals", () => {
    const sellState = () => {
      const sell = activeState({ direction: "SELL", entry: 100, stopLoss: 110 });
      sell.envelope.targets = sell.envelope.targets.map((tp, i) => ({
        ...tp,
        price: [90, 80, 68][i]!,
      }));
      return sell;
    };
    const { state, events } = advanceSignal(sellState(), 89, now);
    expect(state.envelope.targets[0]!.isHit).toBe(true);
    expect(events[0]).toEqual({ type: "tp_hit", tpId: 1 });
    const { state: lost } = advanceSignal(sellState(), 111, now);
    expect(lost.status).toBe("Lost");
  });

  it("leaves terminal signals untouched", () => {
    const won = activeState({ status: "Won" });
    const { state, events } = advanceSignal(won, 500, now);
    expect(state.status).toBe("Won");
    expect(events).toEqual([]);
  });
});

describe("envelope normalization", () => {
  it("wraps legacy take_profits arrays", () => {
    const env = normalizeEnvelope([{ price: 1.09, hit: true }]);
    expect(env.version).toBe(2);
    expect(env.targets).toHaveLength(1);
    expect(env.targets[0]!.isHit).toBe(true);
  });

  it("round-trips v2 envelopes and defaults junk", () => {
    const env = normalizeEnvelope({ version: 2, targets: [], analysis: "x", confidence: 88, risk: "Low", timeframe: "H4", rr: "1:3.2", breakeven: true, openedAt: null, closedAt: null });
    expect(env.confidence).toBe(88);
    expect(normalizeEnvelope(null).targets).toEqual([]);
    expect(normalizeEnvelope("bogus").risk).toBe("Medium");
  });

  it("realizedPips sums only hit targets", () => {
    const env = normalizeEnvelope(null);
    env.targets = [
      { id: 1, price: 1, pips: 50, label: "+50p", isHit: true, hitAt: null },
      { id: 2, price: 2, pips: 90, label: "+90p", isHit: false, hitAt: null },
    ];
    expect(realizedPips(env)).toBe(50);
  });
});

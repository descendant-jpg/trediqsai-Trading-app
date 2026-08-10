import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SendOracleChatResponse } from "@workspace/api-zod";

let server: Server;
let baseUrl: string;

// Captures the arguments the route passes to the Anthropic SDK so tests can
// assert on system prompts and normalized message turns.
const createMock = vi.fn();

async function startFreshApp(): Promise<void> {
  // The oracle router builds its rate-limit bucket at module scope; re-import
  // a fresh copy per test so cases don't leak state into each other.
  vi.resetModules();
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  }));
  const { default: oracleRouter } = await import("./oracle");
  const app: Express = express();
  app.use(express.json());
  app.use(oracleRouter);
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

function textReply(text: string) {
  return { content: [{ type: "text", text }] };
}

const USER_MESSAGE = { role: "user", content: "What do you think of gold?" };

beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  createMock.mockReset();
  await startFreshApp();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.doUnmock("@anthropic-ai/sdk");
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("POST /oracle/chat", () => {
  it("returns the model's reply for a valid request", async () => {
    createMock.mockResolvedValue(textReply("Gold looks constructive. Not financial advice."));
    const { status, body } = await request("POST", "/oracle/chat", {
      messages: [USER_MESSAGE],
    });
    expect(status).toBe(200);
    expect(() => SendOracleChatResponse.parse(body)).not.toThrow();
    expect(body.reply).toBe("Gold looks constructive. Not financial advice.");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("joins multiple text blocks and trims whitespace in the reply", async () => {
    createMock.mockResolvedValue({
      content: [
        { type: "text", text: "  Part one." },
        { type: "tool_use", id: "x", name: "noop", input: {} },
        { type: "text", text: " Part two.  " },
      ],
    });
    const { status, body } = await request("POST", "/oracle/chat", {
      messages: [USER_MESSAGE],
    });
    expect(status).toBe(200);
    expect(body.reply).toBe("Part one. Part two.");
  });

  it("rejects invalid bodies with 400", async () => {
    for (const bad of [
      {},
      { messages: [] },
      { messages: [{ role: "system", content: "hi" }] },
      { messages: [{ role: "user" }] },
      { messages: [USER_MESSAGE], tradingContext: { balance: 1 } },
    ]) {
      const { status, body } = await request("POST", "/oracle/chat", bad);
      expect(status).toBe(400);
      expect(body).toEqual({ error: "Invalid request body" });
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when there is no user turn to respond to", async () => {
    const { status, body } = await request("POST", "/oracle/chat", {
      messages: [{ role: "assistant", content: "Hello, trader." }],
    });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "No user message to respond to." });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("merges adjacent same-role turns and drops a leading assistant turn", async () => {
    createMock.mockResolvedValue(textReply("ok"));
    await request("POST", "/oracle/chat", {
      messages: [
        { role: "assistant", content: "Welcome back." },
        { role: "user", content: "First." },
        { role: "user", content: "Second." },
        { role: "assistant", content: "Reply." },
        { role: "user", content: "Third." },
      ],
    });
    const call = createMock.mock.calls[0]![0];
    expect(call.messages).toEqual([
      { role: "user", content: "First.\n\nSecond." },
      { role: "assistant", content: "Reply." },
      { role: "user", content: "Third." },
    ]);
  });

  it("injects the trading context into the system prompt", async () => {
    createMock.mockResolvedValue(textReply("ok"));
    await request("POST", "/oracle/chat", {
      messages: [USER_MESSAGE],
      tradingContext: {
        balance: 100000,
        equity: 100250.5,
        openPosition: {
          side: "LONG",
          symbol: "XAUUSD",
          entryPrice: 2412.5,
          size: 1,
          unrealizedPnl: -125.25,
        },
        drawdownUsed: 0.85,
        distanceToPayout: 4300,
      },
    });
    const call = createMock.mock.calls[0]![0];
    expect(call.system).toContain("Balance: $100,000.00");
    expect(call.system).toContain("LONG 1 XAUUSD from $2,412.50");
    expect(call.system).toContain("unrealized P&L -$125.25");
    expect(call.system).toContain("85% of the limit (risk mode: critical)");
    expect(call.system).toContain("Profit still needed to reach payout: $4,300.00");
  });

  it("omits the trading-context block when none is supplied", async () => {
    createMock.mockResolvedValue(textReply("ok"));
    await request("POST", "/oracle/chat", { messages: [USER_MESSAGE] });
    const call = createMock.mock.calls[0]![0];
    expect(call.system).not.toContain("Trader account snapshot");
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    // Restart the app without the key.
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await startFreshApp();

    const { status, body } = await request("POST", "/oracle/chat", {
      messages: [USER_MESSAGE],
    });
    expect(status).toBe(503);
    expect(body.error).toContain("missing ANTHROPIC_API_KEY");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the model returns an empty reply", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "   " }] });
    const { status, body } = await request("POST", "/oracle/chat", {
      messages: [USER_MESSAGE],
    });
    expect(status).toBe(502);
    expect(body).toEqual({ error: "The Oracle returned an empty response." });
  });

  it("returns 502 when the model call throws", async () => {
    createMock.mockRejectedValue(new Error("upstream boom"));
    const { status, body } = await request("POST", "/oracle/chat", {
      messages: [USER_MESSAGE],
    });
    expect(status).toBe(502);
    expect(body).toEqual({ error: "The Oracle couldn't reach its AI model." });
  });

  it("rate-limits after 20 requests in a minute with a Retry-After header", async () => {
    createMock.mockResolvedValue(textReply("ok"));
    for (let i = 0; i < 20; i++) {
      const { status } = await request("POST", "/oracle/chat", {
        messages: [USER_MESSAGE],
      });
      expect(status).toBe(200);
    }
    const res = await fetch(`${baseUrl}/oracle/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [USER_MESSAGE] }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("The Oracle needs a breather");
  });
});

import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  SendOracleChatBody,
  SendOracleChatResponse,
  SendStrategyBriefBody,
  SendStrategyBriefResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();

const oracleRateLimit = rateLimit({
  max: 20,
  windowMs: 60_000,
  message:
    "The Oracle needs a breather — you've sent a lot of messages. Try again in a minute.",
});
const SYSTEM_PROMPT = [
  "You are the TradiQs Oracle, the in-app market AI assistant for the TradiQs trading app.",
  "You help traders think about markets: asset analysis, sentiment, notable movers, risk framing, and trading concepts.",
  "Style: concise, confident, trader-friendly. Prefer 2-5 short sentences. No markdown headings or bullet walls — plain conversational text suits the chat bubbles.",
  "Never claim to have live market data; when asked for current prices or real-time numbers, explain you don't have a live feed and reason from general market structure instead.",
  "Always remind users that nothing you say is financial advice when giving anything resembling a trade idea.",
].join(" ");

type TradingContext = NonNullable<
  ReturnType<typeof SendOracleChatBody.parse>["tradingContext"]
>;
function getClient(): Anthropic | null {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey) return new Anthropic({ apiKey });
  return null;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Anthropic requires strictly alternating user/assistant turns starting with
 * "user". Keep the most recent turns to bound token usage, merge adjacent
 * same-role messages, and drop a leading assistant turn.
 */
function normalizeMessages(
  messages: Array<{ role: string; content: string }>,
): ChatTurn[] {
  const recent = messages.slice(-20);
  const out: ChatTurn[] = [];
  for (const m of recent) {
    const role = m.role === "assistant" ? ("assistant" as const) : ("user" as const);
    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n\n${m.content}`;
    } else {
      out.push({ role, content: m.content });
    }
  }
  while (out.length > 0 && out[0]!.role === "assistant") out.shift();
  return out;
}

router.post("/oracle/chat", oracleRateLimit, async (req, res) => {
  const parsed = SendOracleChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const client = getClient();

  if (!client) {
    res.status(503).json({
      error:
        "The Oracle's AI backend isn't configured yet (missing ANTHROPIC_API_KEY).",
    });
    return;
  }

  const chatMessages = normalizeMessages(parsed.data.messages);
  if (chatMessages.length === 0) {
    res.status(400).json({ error: "No user message to respond to." });
    return;
  }

  try {
    const message = await client.messages.create({
      model: process.env["ORACLE_MODEL"] ?? "claude-sonnet-5",
      max_tokens: 8192,
      system: parsed.data.tradingContext
        ? `${SYSTEM_PROMPT}\n\n${buildContextPrompt(parsed.data.tradingContext)}`
        : SYSTEM_PROMPT,
      messages: chatMessages,
    });

    const reply = message.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("")
      .trim();
    if (!reply) {
      res.status(502).json({ error: "The Oracle returned an empty response." });
      return;
    }

    res.json(SendOracleChatResponse.parse({ reply }));
  } catch (err) {
    logger.error({ err }, "Oracle chat completion failed");
    res.status(502).json({ error: "The Oracle couldn't reach its AI model." });
  }
});

/**
 * One-sentence "what am I watching" brief shown in the AutoPilot deployment
 * terminal. Runs server-side for the same reason as /oracle/chat: the
 * Anthropic key must never ship inside the Expo bundle, where anything
 * EXPO_PUBLIC_* is readable by anyone who downloads the app.
 *
 * A failure here is cosmetic — the caller falls back to a static line — so
 * errors return a plain message rather than blocking a deployment.
 */
router.post("/oracle/strategy-brief", oracleRateLimit, async (req, res) => {
  const parsed = SendStrategyBriefBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const client = getClient();
  if (!client) {
    res.status(503).json({
      error: "The strategy engine isn't configured yet (missing ANTHROPIC_API_KEY).",
    });
    return;
  }

  const { botName, capitalPercent } = parsed.data;
  try {
    const message = await client.messages.create({
      model: process.env["ORACLE_MODEL"] ?? "claude-sonnet-5",
      max_tokens: 300,
      system:
        "You write terse, technical one-line status output for an algorithmic trading terminal. Reply with a single sentence, no preamble, no markdown, no quotes.",
      messages: [
        {
          role: "user",
          content: `You are an institutional trading bot named ${botName}. Generate 1 sentence of highly technical trading parameters you are currently monitoring based on a ${capitalPercent}% allocation.`,
        },
      ],
    });

    const brief = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!brief) {
      res.status(502).json({ error: "The strategy engine returned an empty response." });
      return;
    }

    res.json(SendStrategyBriefResponse.parse({ brief }));
  } catch (err) {
    logger.error({ err }, "Strategy brief generation failed");
    res.status(502).json({ error: "The strategy engine couldn't reach its AI model." });
  }
});

export default router;

/**
 * Renders the caller's account snapshot into a system-prompt block so the
 * Oracle can give trade-specific advice (e.g. flagging that a suggested
 * trade conflicts with an open position).
 */
function buildContextPrompt(ctx: TradingContext): string {
  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = [
    "Trader account snapshot (simulated funded-account challenge, USD):",
    `- Balance: ${money(ctx.balance)}; Equity: ${money(ctx.equity)}.`,
  ];
  const pos = ctx.openPosition;
  if (pos) {
    const pnlSign = pos.unrealizedPnl >= 0 ? "+" : "-";
    lines.push(
      `- Open position: ${pos.side} ${pos.size} ${pos.symbol} from ${money(pos.entryPrice)}, unrealized P&L ${pnlSign}${money(Math.abs(pos.unrealizedPnl))}.`,
    );
  } else {
    lines.push("- Open position: none (flat).");
  }
  const ddPct = Math.round(Math.min(Math.max(ctx.drawdownUsed, 0), 1) * 100);
  const riskMode =
    ddPct >= 80 ? "critical" : ddPct >= 50 ? "elevated" : "normal";
  lines.push(
    `- Daily drawdown used: ${ddPct}% of the limit (risk mode: ${riskMode}).`,
    `- Profit still needed to reach payout: ${money(Math.max(ctx.distanceToPayout, 0))}.`,
    "Use this context to personalise answers: reference the trader's open position and risk state when relevant, and warn when an idea would add exposure to an existing position or endanger the drawdown limit. Do not repeat the whole snapshot back unless asked.",
  );
  return lines.join("\n");
}

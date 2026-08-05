import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  SendOracleChatBody,
  SendOracleChatResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SYSTEM_PROMPT = [
  "You are the TradiQs Oracle, the in-app market AI assistant for the TradiQs trading app.",
  "You help traders think about markets: asset analysis, sentiment, notable movers, risk framing, and trading concepts.",
  "Style: concise, confident, trader-friendly. Prefer 2-5 short sentences. No markdown headings or bullet walls — plain conversational text suits the chat bubbles.",
  "Never claim to have live market data; when asked for current prices or real-time numbers, explain you don't have a live feed and reason from general market structure instead.",
  "Always remind users that nothing you say is financial advice when giving anything resembling a trade idea.",
].join(" ");

function getClient(): OpenAI | null {
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const proxyKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (baseURL && proxyKey) return new OpenAI({ baseURL, apiKey: proxyKey });
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey) return new OpenAI({ apiKey });
  return null;
}

router.post("/oracle/chat", async (req, res) => {
  const parsed = SendOracleChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const client = getClient();
  if (!client) {
    res.status(503).json({
      error:
        "The Oracle's AI backend isn't configured yet (missing OpenAI credentials).",
    });
    return;
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env["ORACLE_MODEL"] ?? "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        // Keep only the most recent turns to bound token usage.
        ...parsed.data.messages.slice(-20),
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
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

export default router;

import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { identity, requestUserId, ANONYMOUS_USER } from "../middlewares/identity";
import { hasProAccess } from "../lib/entitlement";
import { logger } from "../lib/logger";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();
const CACHE_MS = 5 * 60_000;
let cache: { expiresAt: number; articles: MarketArticle[] } | null = null;

export type MarketArticle = {
  headline: string;
  summary: string;
  url: string;
  image: string;
  datetime: number;
};
export type UnifiedArticle = { id: string; title: string; summary: string; source: string; url: string; category: string; timestamp: number; imageUrl: string };
type ProprietaryArticle = { id:string; title:string; summary:string; category:string; author:string; image_url?:string; created_at:string };

const sentimentRequest = z.object({
  headline: z.string().trim().min(3).max(500),
  summary: z.string().trim().max(2_500).default(""),
});

const sentimentRateLimit = rateLimit({
  max: 8,
  windowMs: 60_000,
  message: "News sentiment is briefly limited. Please try again in a minute.",
  key: (_req, res) => requestUserId(res),
});

export async function fetchMarketNews(fetchImpl: typeof fetch = fetch): Promise<MarketArticle[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.articles;
  const key = process.env["FINNHUB_API_KEY"];
  console.log("Finnhub Key Exists:", !!key);
  if (!key) throw new Error("FINNHUB_API_KEY is not configured");
  const response = await fetchImpl(`https://finnhub.io/api/v1/news?category=general&token=${key}`);
  const raw: unknown = await response.json();
  console.log("Finnhub Raw Response:", raw);
  if (!response.ok) {
    logger.error({ status: response.status, raw }, "Finnhub news request failed");
    throw new Error(`Finnhub news request failed: ${response.status}`);
  }
  if (!Array.isArray(raw)) {
    logger.error({ raw }, "Finnhub returned a non-array news response");
    throw new Error("Finnhub returned an unexpected news response");
  }
  const articles = raw
    .filter((article): article is Partial<MarketArticle> => !!article && typeof article === "object")
    .filter((article) => typeof article.headline === "string" && typeof article.url === "string" && typeof article.datetime === "number")
    .slice(0, 30)
    .map((article) => ({
      headline: article.headline!.trim(),
      summary: article.summary?.trim() || "Open this headline for the latest market context.",
      url: article.url!,
      image: article.image ?? "",
      datetime: article.datetime!,
    }));
  // Do not cache an empty provider response: a transient Finnhub anomaly
  // should recover on the next UI refresh rather than blanking Radar for 5m.
  if (articles.length > 0) cache = { articles, expiresAt: Date.now() + CACHE_MS };
  return articles;
}

router.get("/market-news", async (req, res) => {
  try {
    const category = ['all','crypto','forex','stocks'].includes(String(req.query.category)) ? String(req.query.category) : 'all';
    const [live, proprietary] = await Promise.all([
      fetchMarketNews(),
      (async () => {
        const url = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"];
        const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!url || !key) return [] as ProprietaryArticle[];
        const filter = category === 'all' ? '' : `&or=(category.eq.${category},category.eq.all)`;
        const response = await fetch(`${url}/rest/v1/tradiqs_articles?select=id,title,summary,category,author,image_url,created_at${filter}`, { headers: { apikey:key, authorization:`Bearer ${key}` } });
        return response.ok ? await response.json() as ProprietaryArticle[] : [] as ProprietaryArticle[];
      })(),
    ]);
    const normalized: UnifiedArticle[] = [
      ...live.map((a, i) => ({ id:`finnhub-${a.datetime}-${i}`, title:a.headline, summary:a.summary, source:'Finnhub', url:a.url, category, timestamp:a.datetime * 1000, imageUrl:a.image })),
      ...proprietary.map(a => ({ id:a.id, title:a.title, summary:a.summary, source:'TradiQs AI Insights', url:`https://tradiqsai.com/insights/${a.id}`, category:a.category, timestamp:Date.parse(a.created_at), imageUrl:a.image_url ?? '' })),
    ].sort((a,b) => b.timestamp - a.timestamp);
    res.json(normalized);
  } catch (err) {
    logger.warn({ err }, "Live market news request failed");
    res.status(503).json({ error: "Live market news is temporarily unavailable." });
  }
});

router.post("/market-news/sentiment", identity(), sentimentRateLimit, async (req, res) => {
  const userId = requestUserId(res);
  if (userId === ANONYMOUS_USER) return res.status(401).json({ error: "Sign in required." });
  if (!(await hasProAccess(userId))) return res.status(403).json({ error: "Pro subscription required." });
  const parsed = sentimentRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid news article is required." });
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) return res.status(503).json({ error: "News analysis is not configured." });
  try {
    const client = new Anthropic({ apiKey: key });
    const completion = await client.messages.create({
      model: process.env["NEWS_SENTIMENT_MODEL"] ?? "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: "You are a cautious financial-news analyst. Return exactly: SENTIMENT: Bullish, Bearish, or Neutral; AFFECTED ASSETS: a short comma-separated list; IMPACT: exactly two concise sentences. Never give financial advice.",
      messages: [{ role: "user", content: `Headline: ${parsed.data.headline}\nSummary: ${parsed.data.summary}` }],
    });
    const analysis = completion.content.filter((item): item is Anthropic.TextBlock => item.type === "text").map((item) => item.text).join("").trim();
    if (!analysis) return res.status(502).json({ error: "The news analyzer returned no result." });
    return res.json({ analysis });
  } catch (err) {
    logger.error({ err, userId }, "News sentiment analysis failed");
    return res.status(502).json({ error: "News sentiment is temporarily unavailable." });
  }
});

export default router;
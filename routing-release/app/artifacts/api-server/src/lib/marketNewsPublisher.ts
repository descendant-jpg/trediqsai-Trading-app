import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const FINNHUB_API_KEY = process.env["FINNHUB_API_KEY"] ?? "";

export const NEWS_REFRESH_INTERVAL_MS = 30 * 60_000;
const MAX_NEWS_PER_REFRESH = 6;

export type NewsCategory = "crypto" | "forex" | "stocks";
export type NewsSentiment = "Bullish" | "Bearish" | "Neutral";

type ProviderArticle = {
  id: string;
  headline: string;
  url: string;
  publishedAt: string;
  category: NewsCategory;
};

export type MarketNews = ProviderArticle & {
  aiSummary: string;
  sentiment: NewsSentiment;
};

const developmentArticles: ProviderArticle[] = [
  {
    id: "development-btc-liquidity",
    headline: "Bitcoin liquidity remains the focus as traders assess risk appetite",
    url: "https://www.finnhub.io/",
    publishedAt: "2026-01-01T12:00:00.000Z",
    category: "crypto",
  },
  {
    id: "development-dollar-data",
    headline: "Dollar traders prepare for a volatile macro-data session",
    url: "https://www.finnhub.io/",
    publishedAt: "2026-01-01T11:30:00.000Z",
    category: "forex",
  },
  {
    id: "development-equity-breadth",
    headline: "Equity market breadth guides the next stock-index move",
    url: "https://www.finnhub.io/",
    publishedAt: "2026-01-01T11:00:00.000Z",
    category: "stocks",
  },
];

function headers(extra: Record<string, string> = {}): Headers {
  return new Headers({
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  });
}

export function isMarketNewsConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
}

function inferCategory(headline: string): NewsCategory {
  const text = headline.toLowerCase();
  if (/\b(bitcoin|crypto|ethereum|token|blockchain)\b/.test(text)) return "crypto";
  if (/\b(forex|dollar|euro|yen|currency|fx)\b/.test(text)) return "forex";
  return "stocks";
}

export async function fetchLatestNews(
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderArticle[]> {
  if (!FINNHUB_API_KEY) {
    if (process.env["NODE_ENV"] === "production") {
      logger.warn("FINNHUB_API_KEY is missing — market news refresh is paused");
      return [];
    }
    return developmentArticles;
  }

  const response = await fetchImpl(
    `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(FINNHUB_API_KEY)}`,
  );
  if (!response.ok) throw new Error(`Finnhub news request failed: ${response.status}`);
  const raw = (await response.json()) as Array<{
    id?: number;
    headline?: string;
    url?: string;
    datetime?: number;
  }>;

  return raw
    .filter((article) => article.id && article.headline && article.url && article.datetime)
    .slice(0, MAX_NEWS_PER_REFRESH)
    .map((article) => ({
      id: `finnhub-${article.id}`,
      headline: article.headline!.trim(),
      url: article.url!,
      publishedAt: new Date(article.datetime! * 1000).toISOString(),
      category: inferCategory(article.headline!),
    }));
}

async function summarizeArticle(
  article: ProviderArticle,
  client: Anthropic | null,
): Promise<Pick<MarketNews, "aiSummary" | "sentiment">> {
  if (!client) {
    return {
      aiSummary: `${article.headline} Monitor follow-through and risk conditions before acting.`,
      sentiment: "Neutral",
    };
  }

  const message = await client.messages.create({
    model: process.env["NEWS_SUMMARY_MODEL"] ?? "claude-haiku-4-5-20251001",
    max_tokens: 180,
    system:
      "You are a concise financial-news analyst. Return exactly two lines: first, a neutral two-sentence trader summary; second, only one label: Bullish, Bearish, or Neutral. Do not give financial advice.",
    messages: [{ role: "user", content: `Category: ${article.category}\nHeadline: ${article.headline}` }],
  });
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const sentiment = lines.find((line) => /^(Bullish|Bearish|Neutral)$/i.test(line));
  const summary = lines.filter((line) => line !== sentiment).join(" ").trim();
  return {
    aiSummary: summary || `${article.headline} Monitor follow-through and risk conditions before acting.`,
    sentiment:
      sentiment?.toLowerCase() === "bullish"
        ? "Bullish"
        : sentiment?.toLowerCase() === "bearish"
          ? "Bearish"
          : "Neutral",
  };
}

async function existingIds(ids: string[], fetchImpl: typeof fetch): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const response = await fetchImpl(
    `${SUPABASE_URL}/rest/v1/market_news?select=external_id&external_id=in.(${ids.map(encodeURIComponent).join(",")})`,
    { headers: headers() },
  );
  if (!response.ok) throw new Error(`Market news cache read failed: ${response.status}`);
  const rows = (await response.json()) as Array<{ external_id: string }>;
  return new Set(rows.map((row) => row.external_id));
}

export async function publishMarketNews(
  fetchImpl: typeof fetch = fetch,
  client: Anthropic | null = process.env["ANTHROPIC_API_KEY"]
    ? new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
    : null,
): Promise<number> {
  if (!isMarketNewsConfigured()) return 0;
  try {
    const articles = await fetchLatestNews(fetchImpl);
    const known = await existingIds(articles.map((article) => article.id), fetchImpl);
    const fresh = articles.filter((article) => !known.has(article.id));
    if (!fresh.length) return 0;

    const records = await Promise.all(
      fresh.map(async (article) => {
        const analysis = await summarizeArticle(article, client);
        return {
          external_id: article.id,
          headline: article.headline,
          ai_summary: analysis.aiSummary,
          category: article.category,
          sentiment: analysis.sentiment,
          url: article.url,
          published_at: article.publishedAt,
        };
      }),
    );
    const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/market_news?on_conflict=external_id`, {
      method: "POST",
      headers: headers({
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(records),
    });
    if (!response.ok) throw new Error(`Market news cache write failed: ${response.status}`);
    logger.info({ count: records.length }, "Published market news");
    return records.length;
  } catch (err) {
    logger.warn({ err }, "Market news refresh failed");
    return 0;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startMarketNewsPublisher(): void {
  if (timer || !isMarketNewsConfigured()) return;
  void publishMarketNews();
  timer = setInterval(() => void publishMarketNews(), NEWS_REFRESH_INTERVAL_MS);
  timer.unref?.();
}

export function stopMarketNewsPublisher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
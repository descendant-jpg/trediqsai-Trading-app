/**
 * Publishes the server-owned reference price used by payout-eligible trades.
 *
 * Why this exists: authenticated users can write their own `trades` rows via
 * PostgREST, so any P&L derived from a client-supplied price is forgeable —
 * and payouts are real money. The `open_server_trade` / `close_server_trade`
 * RPCs therefore price trades from `public.market_prices`, which only the
 * service role may write. This publisher keeps that row fresh.
 *
 * The Supabase drawdown-monitor edge function does the same upsert on its
 * own cron. Both are safe to run together (idempotent upsert on `asset`);
 * this one means payouts keep working in deployments where the edge function
 * and pg_cron were never set up.
 *
 * Fails closed by omission: if this cannot publish, `trusted_market_price`
 * finds a stale row and the guarded RPCs refuse to open verified trades. No
 * payout can be built on a price we did not observe.
 */
import { logger } from "./logger.js";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

/** Refresh well inside the 2-minute freshness window the RPCs enforce. */
export const PUBLISH_INTERVAL_MS = 45_000;
export const PRICE_ASSET = "BTC/USD";

export function isPricePublisherConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Coinbase spot — the same provider the app's live feed and the drawdown
 * monitor fall back to. Binance is geo-blocked from this infrastructure.
 */
export async function fetchSpotPrice(
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const res = await fetchImpl("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  if (!res.ok) throw new Error(`Price fetch failed: ${res.status}`);
  const json = (await res.json()) as { data?: { amount?: string } };
  const price = Number(json?.data?.amount);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Price fetch returned an invalid amount");
  }
  return price;
}

/**
 * Upserts one reference price. Returns the published price, or null when the
 * publisher is unconfigured or the upstream/write failed — callers treat null
 * as "no trusted price right now" rather than substituting a guess.
 */
export async function publishMarketPrice(
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  if (!isPricePublisherConfigured()) return null;
  try {
    const price = await fetchSpotPrice(fetchImpl);
    const res = await fetchImpl(
      `${SUPABASE_URL}/rest/v1/market_prices?on_conflict=asset`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          asset: PRICE_ASSET,
          price,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "market_prices upsert failed — verified trades will pause until it recovers",
      );
      return null;
    }
    return price;
  } catch (err) {
    logger.warn({ err }, "Market price publish failed");
    return null;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the publish loop. No-op when Supabase credentials are absent. */
export function startMarketPricePublisher(): void {
  if (timer || !isPricePublisherConfigured()) return;
  void publishMarketPrice();
  timer = setInterval(() => void publishMarketPrice(), PUBLISH_INTERVAL_MS);
  timer.unref?.();
}

export function stopMarketPricePublisher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

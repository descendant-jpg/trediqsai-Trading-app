import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The publisher is the only thing keeping `public.market_prices` fresh in
 * deployments without the Supabase cron. If it silently substitutes a guess
 * or writes an unvalidated upstream value, forged prices reach payout-eligible
 * trades — so these tests pin the fail-closed behaviour.
 */

const SUPABASE_URL = "https://project.supabase.co";

async function loadModule() {
  vi.resetModules();
  return import("./marketPricePublisher.js");
}

function okSpot(amount: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { amount } }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("publishMarketPrice", () => {
  it("upserts the fetched spot price with service-role credentials", async () => {
    const { publishMarketPrice, PRICE_ASSET } = await loadModule();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = vi.fn(async (url: any, init?: any) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("coinbase")) return okSpot("64000.25");
      return { ok: true, status: 201, text: async () => "" } as unknown as Response;
    });

    const price = await publishMarketPrice(fakeFetch as unknown as typeof fetch);

    expect(price).toBe(64000.25);
    const upsert = calls[1]!;
    expect(upsert.url).toContain("/rest/v1/market_prices");
    expect(upsert.url).toContain("on_conflict=asset");
    const headers = upsert.init!.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("service-role-test-key");
    expect(headers["Prefer"]).toContain("merge-duplicates");
    const body = JSON.parse(upsert.init!.body as string);
    expect(body).toMatchObject({ asset: PRICE_ASSET, price: 64000.25 });
  });

  it("returns null instead of publishing when the upstream price is invalid", async () => {
    const { publishMarketPrice } = await loadModule();
    const fakeFetch = vi.fn(async (url: any) => {
      if (String(url).includes("coinbase")) return okSpot("not-a-number");
      throw new Error("must not write a price we could not validate");
    });

    await expect(
      publishMarketPrice(fakeFetch as unknown as typeof fetch),
    ).resolves.toBeNull();
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null when the upstream feed is unavailable", async () => {
    const { publishMarketPrice } = await loadModule();
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as unknown as Response);

    await expect(
      publishMarketPrice(fakeFetch as unknown as typeof fetch),
    ).resolves.toBeNull();
  });

  it("returns null when the Supabase write is rejected", async () => {
    const { publishMarketPrice } = await loadModule();
    const fakeFetch = vi.fn(async (url: any) => {
      if (String(url).includes("coinbase")) return okSpot("64000");
      return { ok: false, status: 401, text: async () => "denied" } as unknown as Response;
    });

    await expect(
      publishMarketPrice(fakeFetch as unknown as typeof fetch),
    ).resolves.toBeNull();
  });

  it("does nothing without service-role credentials", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { publishMarketPrice, isPricePublisherConfigured } = await loadModule();
    const fakeFetch = vi.fn();

    expect(isPricePublisherConfigured()).toBe(false);
    await expect(
      publishMarketPrice(fakeFetch as unknown as typeof fetch),
    ).resolves.toBeNull();
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("refreshes inside the freshness window the database enforces", async () => {
    const { PUBLISH_INTERVAL_MS } = await loadModule();
    // trusted_market_price() rejects rows older than 2 minutes.
    expect(PUBLISH_INTERVAL_MS).toBeLessThan(120_000);
  });
});

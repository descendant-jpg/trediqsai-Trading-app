import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://project.supabase.co";

async function loadModule() {
  vi.resetModules();
  return import("./marketNewsPublisher.js");
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("market news publisher", () => {
  it("uses development articles without a provider key and writes only unknown records", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    const { publishMarketNews } = await loadModule();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("select=external_id")) {
        return { ok: true, json: async () => [{ external_id: "development-btc-liquidity" }] } as Response;
      }
      return { ok: true, status: 201 } as Response;
    });

    const published = await publishMarketNews(fetchMock as unknown as typeof fetch, null);

    expect(published).toBe(2);
    const write = calls.find((call) => call.init?.method === "POST")!;
    const body = JSON.parse(String(write.init?.body));
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ sentiment: "Neutral", category: expect.any(String) });
    expect(write.url).toContain("/rest/v1/market_news");
  });

  it("does not make provider or cache requests when server credentials are absent", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { publishMarketNews } = await loadModule();
    const fetchMock = vi.fn();
    await expect(publishMarketNews(fetchMock as unknown as typeof fetch, null)).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps refreshes infrequent enough to control provider and model costs", async () => {
    const { NEWS_REFRESH_INTERVAL_MS } = await loadModule();
    expect(NEWS_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(15 * 60_000);
  });
});
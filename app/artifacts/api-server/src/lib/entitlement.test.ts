import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests cover the *default* Supabase-backed lookup -- the code path
 * that actually runs in production. The route tests inject a fake lookup, so
 * they would not catch a broken query, a schema mismatch, or a response shape
 * the parser mishandles. Here the network call itself is stubbed instead, so
 * the real query string and the real parsing logic are both exercised.
 */

const URL_ENV = "https://project.supabase.co";

/** Load a fresh module instance with credentials configured. */
async function loadEntitlement(
  env: { url?: string; key?: string } = { url: URL_ENV, key: "service-key" },
) {
  vi.resetModules();
  vi.stubEnv("SUPABASE_URL", env.url ?? "");
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", env.key ?? "");
  return import("./entitlement");
}

/** Stub fetch with a single PostgREST-style JSON array response. */
function stubRows(rows: unknown[], status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(rows), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("supabase tier lookup query contract", () => {
  it("queries the profiles table for the entitlement columns with the service key", async () => {
    const fetchMock = stubRows([{ tier: "pro" }]);
    const { hasProAccess } = await loadEntitlement();

    await hasProAccess("user-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      `${URL_ENV}/rest/v1/profiles`,
    );
    expect(parsed.searchParams.get("id")).toBe("eq.user-1");
    expect(parsed.searchParams.get("limit")).toBe("1");

    // The selected columns are the schema contract. If a migration renames
    // one of these, this assertion is the tripwire.
    const selected = (parsed.searchParams.get("select") ?? "").split(",");
    expect(selected).toEqual([
      "tier",
      "manual_tier_override",
      "free_trial_until",
    ]);

    // Must use the service role key: `tier` is not readable around by anon.
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe("service-key");
    expect(headers.get("authorization")).toBe("Bearer service-key");
  });

  it("grants access for each paid tier the column can hold", async () => {
    for (const tier of ["pro", "elite", "whale", "vip", "Pro", " ELITE "]) {
      stubRows([{ tier }]);
      const { hasProAccess } = await loadEntitlement();
      await expect(hasProAccess(`user-${tier}`)).resolves.toBe(true);
    }
  });

  it("denies access for free and unrecognised tiers", async () => {
    for (const tier of ["free", "", null, "basic"]) {
      stubRows([{ tier }]);
      const { hasProAccess } = await loadEntitlement();
      await expect(hasProAccess(`user-${tier}`)).resolves.toBe(false);
    }
  });

  it("lets a staff override upgrade a free account", async () => {
    stubRows([{ tier: "free", manual_tier_override: "elite" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("comped-user")).resolves.toBe(true);
  });

  it("lets a staff override downgrade a paid account", async () => {
    stubRows([{ tier: "pro", manual_tier_override: "free" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("revoked-user")).resolves.toBe(false);
  });

  it("grants access during an unexpired free trial", async () => {
    stubRows([{ tier: "free", free_trial_until: "2026-01-02T00:00:00Z" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("trial-user")).resolves.toBe(true);
  });

  it("denies access once the free trial has expired", async () => {
    stubRows([{ tier: "free", free_trial_until: "2025-12-31T00:00:00Z" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("expired-user")).resolves.toBe(false);
  });

  it("denies access when the profile row is missing", async () => {
    stubRows([]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("ghost")).resolves.toBe(false);
  });

  it("fails closed when Supabase rejects the query (e.g. unknown column)", async () => {
    // Exactly what PostgREST returns when a selected column does not exist.
    stubRows({ message: 'column profiles.tier does not exist' } as never, 400);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("user-1")).resolves.toBe(false);
  });

  it("fails closed when the network call throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("user-1")).resolves.toBe(false);
  });

  it("fails closed and never calls out when credentials are missing", async () => {
    const fetchMock = stubRows([{ tier: "pro" }]);
    const { hasProAccess, isEntitlementConfigured } = await loadEntitlement({
      url: URL_ENV,
      key: "",
    });
    expect(isEntitlementConfigured).toBe(false);
    await expect(hasProAccess("user-1")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("denies anonymous callers without hitting the network", async () => {
    const fetchMock = stubRows([{ tier: "pro" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("anonymous")).resolves.toBe(false);
    await expect(hasProAccess("")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The lookup is intentionally uncached. A cached "pro" answer would keep
// authorizing a user whose subscription just ended, and the process that
// performs the downgrade (billing webhook, admin route) cannot invalidate a
// cache living in this process.
describe("no stale authorization", () => {
  it("re-reads the tier on every check", async () => {
    const fetchMock = stubRows([{ tier: "pro" }]);
    const { hasProAccess } = await loadEntitlement();

    await hasProAccess("user-1");
    await hasProAccess("user-1");
    await hasProAccess("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("denies immediately once the stored tier drops to free", async () => {
    stubRows([{ tier: "pro" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("user-1")).resolves.toBe(true);

    // Downgrade happens elsewhere (webhook/admin); no invalidation call.
    stubRows([{ tier: "free" }]);
    await expect(hasProAccess("user-1")).resolves.toBe(false);
  });

  it("grants immediately once the stored tier is upgraded", async () => {
    stubRows([{ tier: "free" }]);
    const { hasProAccess } = await loadEntitlement();
    await expect(hasProAccess("user-1")).resolves.toBe(false);

    stubRows([{ tier: "elite" }]);
    await expect(hasProAccess("user-1")).resolves.toBe(true);
  });

  it("denies as soon as a free trial has elapsed", async () => {
    const { hasProAccess } = await loadEntitlement();

    stubRows([
      { tier: "free", free_trial_until: new Date(Date.now() + 60_000).toISOString() },
    ]);
    await expect(hasProAccess("user-1")).resolves.toBe(true);

    vi.setSystemTime(Date.now() + 120_000);
    await expect(hasProAccess("user-1")).resolves.toBe(false);
  });
});

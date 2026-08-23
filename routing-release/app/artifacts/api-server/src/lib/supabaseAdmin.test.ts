import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

async function loadAdmin() {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  return import('./supabaseAdmin.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('RevenueCat event ordering persistence contract', () => {
  it('calls the database monotonic RPC with the verified event timestamp', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response('true', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { applyRevenueCatTier } = await loadAdmin();

    await expect(applyRevenueCatTier('user-123', 'starter', new Date(1_700_000_000_000))).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/rest/v1/rpc/apply_revenuecat_entitlement');
    expect(JSON.parse(String(init.body))).toEqual({
      p_user_id: 'user-123',
      p_tier: 'starter',
      p_event_at: '2023-11-14T22:13:20.000Z',
    });
  });
});

describe('Stripe entitlement persistence contract', () => {
  it('calls the replay-safe subscription RPC with the verified PaymentIntent', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response('true', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { grantEliteTier } = await loadAdmin();

    await expect(
      grantEliteTier('user-123', 'pi_verified', new Date(1_700_000_000_000)),
    ).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/rest/v1/rpc/handle_subscription_update');
    expect(JSON.parse(String(init.body))).toEqual({
      p_user_id: 'user-123',
      p_tier: 'elite',
      p_provider: 'stripe',
      p_event_id: 'pi_verified',
      p_event_at: '2023-11-14T22:13:20.000Z',
    });
  });

  it('keeps the RPC service-role-only and records replay keys', () => {
    const sql = readFileSync(
      new URL('../../../tradiqsai/supabase/migrations/025_subscription_update_rpc.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain('primary key (provider, event_id)');
    expect(sql).toContain('on conflict (provider, event_id) do nothing');
    expect(sql).toContain('revoke all on function public.handle_subscription_update');
    expect(sql).toContain('to service_role;');
    expect(sql).not.toContain('rank_tier');
  });
});

describe('RevenueCat webhook ordering migration contract', () => {
  it('uses executable PL/pgSQL row-count handling and keeps the RPC server-only', () => {
    const sql = readFileSync(
      new URL('../../../tradiqsai/supabase/migrations/023_revenuecat_webhook_ordering.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('updated_rows integer := 0;');
    expect(sql).toContain('get diagnostics updated_rows = row_count;');
    expect(sql).toContain('return updated_rows > 0;');
    expect(sql).not.toContain('get diagnostics changed = row_count > 0;');
    expect(sql).toContain('revoke all on function public.apply_revenuecat_entitlement');
    expect(sql).toContain('to service_role;');
  });
});

describe('RevenueCat profile persistence contract', () => {
  it('writes only the dedicated RevenueCat tier through the service role', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { setBillingTier } = await loadAdmin();

    await setBillingTier('user-123', 'pro');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/rest/v1/profiles?id=eq.user-123');
    expect(JSON.parse(String(init.body))).toEqual({ revenuecat_tier: 'pro' });
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer service-key');
    expect(headers.get('apikey')).toBe('service-key');
  });
});
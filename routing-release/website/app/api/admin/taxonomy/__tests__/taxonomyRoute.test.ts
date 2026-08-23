/**
 * Contract tests for the shared taxonomy endpoint that backs the
 * Categories & Tags page and the Market Insights editor's category picker.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

const db = vi.hoisted(() => {
  const state: { select: Result; insert: Result; del: Result } = {
    select: { data: [], error: null },
    insert: { data: null, error: null },
    del: { data: null, error: null, count: 1 },
  };
  const from = vi.fn(() => ({
    select: vi.fn(() => {
      const chain = {
        order: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        then: (resolve: (r: Result) => unknown) => resolve(state.select),
      };
      return chain;
    }),
    insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => state.insert) })) })),
    delete: vi.fn(() => ({ eq: vi.fn(async () => state.del) })),
  }));
  return { state, from };
});

vi.mock('../../../../../lib/supabase-server', () => ({
  getSupabaseServer: vi.fn(() => ({ from: db.from })),
}));

import { DELETE, GET, POST } from '../route';
import { getSupabaseServer } from '../../../../../lib/supabase-server';

function req(method: string, url = 'https://tradiqs.example/api/admin/taxonomy', body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  db.state.select = { data: [{ id: 1, name: 'Analysis', kind: 'category', created_at: 'now' }], error: null };
  db.state.insert = { data: { id: 2, name: 'Macro', kind: 'category', created_at: 'now' }, error: null };
  db.state.del = { data: null, error: null, count: 1 };
});

afterEach(() => vi.clearAllMocks());

describe('admin taxonomy endpoint', () => {
  it('lists taxonomy terms', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terms).toHaveLength(1);
    expect(body.terms[0].name).toBe('Analysis');
  });

  it('creates a term, defaulting the kind to category', async () => {
    const res = await POST(req('POST', undefined, { name: '  Macro ' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.term.name).toBe('Macro');
  });

  it('rejects an empty name', async () => {
    const res = await POST(req('POST', undefined, { name: '   ' }));
    expect(res.status).toBe(422);
  });

  it('maps a unique violation to 409', async () => {
    db.state.insert = { data: null, error: { code: '23505', message: 'duplicate' } };
    const res = await POST(req('POST', undefined, { name: 'Analysis' }));
    expect(res.status).toBe(409);
  });

  it('deletes by query-param id and reports missing terms', async () => {
    const ok = await DELETE(req('DELETE', 'https://tradiqs.example/api/admin/taxonomy?id=1'));
    expect(ok.status).toBe(200);

    db.state.del = { data: null, error: null, count: 0 };
    const missing = await DELETE(req('DELETE', 'https://tradiqs.example/api/admin/taxonomy?id=999'));
    expect(missing.status).toBe(404);
  });

  it('requires an id for delete', async () => {
    const res = await DELETE(req('DELETE'));
    expect(res.status).toBe(422);
  });

  it('returns 503 when the database is not configured', async () => {
    vi.mocked(getSupabaseServer).mockReturnValueOnce(null);
    const res = await GET(req('GET'));
    expect(res.status).toBe(503);
  });
});

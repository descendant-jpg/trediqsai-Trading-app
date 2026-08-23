/**
 * Contract tests for the public blog posts endpoint.
 *
 * Only published posts should be visible. Drafts and archived posts must
 * never leak. The endpoint also supports filtering by tag, pagination, and
 * fetching a single post by slug.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
const { getSupabaseServer } = vi.hoisted(() => ({ getSupabaseServer: vi.fn() }));
vi.mock('../../../../lib/supabase-server', () => ({ getSupabaseServer }));

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Supabase stub helpers
//
// Each method spy is assigned once and always returns the same proxy object
// so that spy call counts are never overwritten by subsequent chain calls.
// ---------------------------------------------------------------------------
function buildQuery(result: Record<string, unknown>) {
  const proxy = new Proxy(result, {
    get(target, prop) {
      if (prop === 'then') return undefined; // not a thenable — await returns proxy
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      const fn = vi.fn(() => proxy);
      (target as Record<string | symbol, unknown>)[prop] = fn;
      return fn;
    },
  });
  return proxy as Record<string, unknown> & {
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    contains: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
}

function stubFrom(tableResults: Record<string, Record<string, unknown>>) {
  const queries: Record<string, ReturnType<typeof buildQuery>> = {};
  const from = vi.fn((table: string) => {
    if (!queries[table]) queries[table] = buildQuery(tableResults[table] ?? {});
    return queries[table];
  });
  getSupabaseServer.mockReturnValue({ from });
  return { from, queries };
}

// ---------------------------------------------------------------------------
// Request factories
// ---------------------------------------------------------------------------
const BASE = 'https://tradiqs.example/api/posts';

function getReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  getSupabaseServer.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 503 when Supabase is not configured
// ---------------------------------------------------------------------------
describe('public posts — Supabase unavailable', () => {
  it('returns 503 with a friendly message', async () => {
    getSupabaseServer.mockReturnValue(null);

    const res = await GET(getReq());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// List — published-only visibility
// ---------------------------------------------------------------------------
describe('public posts — list', () => {
  it('returns only published posts and correct pagination metadata', async () => {
    const posts = [
      { id: 1, title: 'Published', published_at: '2024-01-01T00:00:00Z' },
    ];
    const { queries } = stubFrom({ blog_posts: { data: posts, error: null, count: 1 } });

    const res = await GET(getReq());

    expect(res.status).toBe(200);
    // The status=published filter must always be applied.
    expect(queries.blog_posts.eq).toHaveBeenCalledWith('status', 'published');

    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
  });

  it('never exposes draft posts (no draft eq call, always has published eq call)', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    await GET(getReq());

    const eqCalls = (queries.blog_posts.eq as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(eqCalls.some(([col, val]) => col === 'status' && val === 'published')).toBe(true);
    expect(eqCalls.every(([col, val]) => !(col === 'status' && val === 'draft'))).toBe(true);
  });

  it('orders results by published_at descending', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    await GET(getReq());

    expect(queries.blog_posts.order).toHaveBeenCalledWith('published_at', { ascending: false });
  });

  it('applies tag filter using array contains', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    await GET(getReq({ tag: 'forex' }));

    expect(queries.blog_posts.contains).toHaveBeenCalledWith('tags', ['forex']);
  });

  it('sanitises a tag before filtering (strips special chars, lowercases)', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    await GET(getReq({ tag: 'Forex!@#' }));

    expect(queries.blog_posts.contains).toHaveBeenCalledWith('tags', ['forex']);
  });

  it('respects page and limit parameters', async () => {
    stubFrom({ blog_posts: { data: [], error: null, count: 50 } });

    const res = await GET(getReq({ page: '3', limit: '5' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(3);
    expect(body.limit).toBe(5);
  });

  it('passes the correct range offset for page 3 limit 5', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 50 } });

    await GET(getReq({ page: '3', limit: '5' }));

    // page 3, limit 5 → offset 10..14
    expect(queries.blog_posts.range).toHaveBeenCalledWith(10, 14);
  });

  it('caps limit at 50', async () => {
    stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    const res = await GET(getReq({ limit: '999' }));

    const body = await res.json();
    expect(body.limit).toBe(50);
  });

  it('floors page at 1 for invalid values', async () => {
    stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    const res = await GET(getReq({ page: '-5' }));

    const body = await res.json();
    expect(body.page).toBe(1);
  });

  it('returns 500 on a database error', async () => {
    stubFrom({ blog_posts: { data: null, error: { message: 'db error' }, count: null } });

    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });

  it('returns an empty posts array (not null) when there are no results', async () => {
    stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    const res = await GET(getReq());
    const body = await res.json();
    expect(Array.isArray(body.posts)).toBe(true);
    expect(body.posts).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Single post by slug
// ---------------------------------------------------------------------------
describe('public posts — single post by slug', () => {
  it('returns the full post (including content) for a valid published slug', async () => {
    const post = {
      id: 3,
      title: 'My Post',
      slug: 'my-post',
      content: 'Full body text.',
      published_at: '2024-06-01T00:00:00Z',
    };
    const { queries } = stubFrom({ blog_posts: { data: post, error: null } });

    const res = await GET(getReq({ slug: 'my-post' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.id).toBe(3);
    expect(body.post.content).toBe('Full body text.');
    // Must still filter to published only.
    expect(queries.blog_posts.eq).toHaveBeenCalledWith('status', 'published');
    expect(queries.blog_posts.eq).toHaveBeenCalledWith('slug', 'my-post');
  });

  it('returns 404 for a slug that does not exist or is not published', async () => {
    stubFrom({ blog_posts: { data: null, error: { code: 'PGRST116', message: 'not found' } } });

    const res = await GET(getReq({ slug: 'draft-post' }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('returns 422 for a slug that sanitises to an empty string', async () => {
    // Route checks Supabase first, so a client must be present for slug
    // validation to run.
    stubFrom({ blog_posts: {} });

    // A slug composed entirely of special characters sanitises to empty string.
    const res = await GET(getReq({ slug: '!!!' }));
    expect(res.status).toBe(422);
  });

  it('strips special characters from the slug before querying', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1, slug: 'my-post', content: '' }, error: null } });

    await GET(getReq({ slug: 'My-Post!!' }));

    // Should sanitise to 'my-post' (lowercase, strip non-slug chars).
    expect(queries.blog_posts.eq).toHaveBeenCalledWith('slug', 'my-post');
  });

  it('returns 500 on an unexpected database error', async () => {
    stubFrom({ blog_posts: { data: null, error: { code: '99999', message: 'boom' } } });

    const res = await GET(getReq({ slug: 'some-post' }));
    expect(res.status).toBe(500);
  });
});

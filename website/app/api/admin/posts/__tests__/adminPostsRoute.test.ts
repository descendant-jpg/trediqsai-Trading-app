/**
 * Contract tests for the admin CMS posts endpoint.
 *
 * Authentication is enforced by middleware; these tests focus on the route's
 * own responsibilities: Supabase unavailability, request validation, and the
 * correct DB calls for each CRUD operation.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
const { getSupabaseServer } = vi.hoisted(() => ({ getSupabaseServer: vi.fn() }));
vi.mock('../../../../../lib/supabase-server', () => ({ getSupabaseServer }));

import { DELETE, GET, POST, PUT } from '../route';

// ---------------------------------------------------------------------------
// Supabase stub helpers
//
// Each method spy is assigned once and always returns the same proxy object so
// that spy call counts are never overwritten by subsequent chain calls.
// ---------------------------------------------------------------------------
function buildQuery(result: Record<string, unknown>) {
  // Proxy is awaitable — Promise.resolve(proxy) resolves to `result` fields.
  const proxy = new Proxy(result, {
    get(target, prop) {
      if (prop === 'then') return undefined; // not a thenable — await returns proxy
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      // Return a vi.fn that always returns `proxy` so spies accumulate on it.
      const fn = vi.fn(() => proxy);
      (target as Record<string | symbol, unknown>)[prop] = fn;
      return fn;
    },
  });
  return proxy as Record<string, unknown> & {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
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
const BASE = 'https://tradiqs.example/api/admin/posts';

function getReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function postReq(body: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putReq(body: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(params: Record<string, string> = {}, body?: unknown): NextRequest {
  const url = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (body !== undefined) {
    return new NextRequest(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest(url, { method: 'DELETE' });
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
describe('admin posts — Supabase unavailable', () => {
  beforeEach(() => {
    getSupabaseServer.mockReturnValue(null);
  });

  it('GET returns 503', async () => {
    expect((await GET(getReq())).status).toBe(503);
  });

  it('POST returns 503', async () => {
    expect((await POST(postReq({ title: 'Test' }))).status).toBe(503);
  });

  it('PUT returns 503', async () => {
    expect((await PUT(putReq({ id: 1, title: 'Updated' }))).status).toBe(503);
  });

  it('DELETE returns 503', async () => {
    expect((await DELETE(deleteReq({ id: '1' }))).status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET — list posts
// ---------------------------------------------------------------------------
describe('admin posts — GET', () => {
  it('returns a list of posts with total and pagination metadata', async () => {
    const posts = [{ id: 1, title: 'Post one', status: 'draft' }];
    const { queries } = stubFrom({ blog_posts: { data: posts, error: null, count: 1 } });

    const res = await GET(getReq());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.posts).toEqual(posts);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    void queries;
  });

  it('applies a valid status filter', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    await GET(getReq({ status: 'published' }));

    expect(queries.blog_posts.eq).toHaveBeenCalledWith('status', 'published');
  });

  it('ignores an invalid status filter (no eq call for bad status)', async () => {
    const { queries } = stubFrom({ blog_posts: { data: [], error: null, count: 0 } });

    await GET(getReq({ status: 'invalid-status' }));

    const eqCalls = (queries.blog_posts.eq as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    expect(eqCalls.every(([, val]) => val !== 'invalid-status')).toBe(true);
  });

  it('returns 500 when Supabase reports an error', async () => {
    stubFrom({ blog_posts: { data: null, error: { message: 'db error' }, count: null } });

    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST — create a post
// ---------------------------------------------------------------------------
describe('admin posts — POST', () => {
  const validPost = {
    title: 'Hello World',
    excerpt: 'A brief intro',
    content: 'Full content here.',
    asset_class: 'Forex',
    category: 'Analysis',
    ai_badge: '',
    upvotes: 0,
    status: 'draft',
    author: 'Admin',
    tags: ['forex', 'analysis'],
  };

  it('creates a post and returns 201 with the new record', async () => {
    const saved = { ...validPost, id: 42, slug: 'hello-world' };
    stubFrom({ blog_posts: { data: saved, error: null } });

    const res = await POST(postReq(validPost));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.post.id).toBe(42);
  });

  it('derives a slug from the title when none is supplied', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1, slug: 'hello-world' }, error: null } });

    await POST(postReq({ title: 'Hello World' }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.slug).toBe('hello-world');
  });

  it('accepts an explicit valid slug', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1, slug: 'my-slug' }, error: null } });

    await POST(postReq({ title: 'Anything', slug: 'my-slug' }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.slug).toBe('my-slug');
  });

  it('returns 422 when title is missing', async () => {
    stubFrom({ blog_posts: {} });

    const res = await POST(postReq({ content: 'No title here' }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('title') });
  });

  it('returns 409 when the slug is already taken', async () => {
    stubFrom({ blog_posts: { data: null, error: { code: '23505', message: 'duplicate key' } } });

    const res = await POST(postReq({ title: 'Hello World' }));
    expect(res.status).toBe(409);
  });

  it('returns 400 for a non-JSON body', async () => {
    stubFrom({ blog_posts: {} });
    const req = new NextRequest(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect((await POST(req)).status).toBe(400);
  });

  it('defaults status to draft when not supplied', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1 }, error: null } });

    await POST(postReq({ title: 'Draft test' }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.status).toBe('draft');
  });

  it('sets published_at when status is published and none supplied', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1 }, error: null } });

    await POST(postReq({ title: 'Published post', status: 'published' }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.published_at).toBeTruthy();
  });

  it('sanitises tags (strips special chars, lowercases)', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1 }, error: null } });

    await POST(postReq({ title: 'Tag test', tags: ['Forex!', '  Crypto  ', 'S&P'] }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.tags).toEqual(['forex', 'crypto', 'sp']);
  });

  it('calculates reading time server-side from the submitted body', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1 }, error: null } });
    const content = Array.from({ length: 401 }, (_, index) => `word${index}`).join(' ');

    await POST(postReq({ title: 'Reading time', content }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.read_time).toBe('3 min read');
  });

  it('preserves an optional cover image URL', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1 }, error: null } });

    await POST(postReq({ title: 'Cover image', cover_image: 'https://images.example/cover.jpg' }));

    const insertArg = (queries.blog_posts.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.cover_image).toBe('https://images.example/cover.jpg');
  });

  it('returns 500 on an unexpected database error', async () => {
    stubFrom({ blog_posts: { data: null, error: { code: '99999', message: 'unknown' } } });

    const res = await POST(postReq({ title: 'Error test' }));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT — update a post
// ---------------------------------------------------------------------------
describe('admin posts — PUT', () => {
  it('updates a post and returns the record', async () => {
    const updated = { id: 5, title: 'New Title', status: 'published' };
    stubFrom({ blog_posts: { data: updated, error: null } });

    const res = await PUT(putReq({ id: 5, title: 'New Title' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.id).toBe(5);
  });

  it('returns 422 when id is missing from the body', async () => {
    stubFrom({ blog_posts: {} });
    const res = await PUT(putReq({ title: 'No id here' }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('id') });
  });

  it('returns 422 when title is set to an empty string', async () => {
    stubFrom({ blog_posts: {} });
    const res = await PUT(putReq({ id: 1, title: '' }));
    expect(res.status).toBe(422);
  });

  it('returns 422 for an invalid slug format', async () => {
    stubFrom({ blog_posts: {} });
    const res = await PUT(putReq({ id: 1, slug: 'INVALID SLUG!!' }));
    expect(res.status).toBe(422);
  });

  it('returns 422 for an invalid status value', async () => {
    stubFrom({ blog_posts: {} });
    const res = await PUT(putReq({ id: 1, status: 'nonsense' }));
    expect(res.status).toBe(422);
  });

  it('returns 404 when the post does not exist', async () => {
    stubFrom({ blog_posts: { data: null, error: { code: 'PGRST116', message: 'not found' } } });

    const res = await PUT(putReq({ id: 9999, title: 'Ghost' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 on a slug conflict', async () => {
    stubFrom({ blog_posts: { data: null, error: { code: '23505', message: 'duplicate key' } } });

    const res = await PUT(putReq({ id: 1, slug: 'taken-slug' }));
    expect(res.status).toBe(409);
  });

  it('sets published_at when transitioning to published without a date', async () => {
    const { queries } = stubFrom({ blog_posts: { data: { id: 1 }, error: null } });

    await PUT(putReq({ id: 1, status: 'published' }));

    const updateArg = (queries.blog_posts.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg.published_at).toBeTruthy();
  });

  it('returns 400 for a non-JSON body', async () => {
    stubFrom({ blog_posts: {} });
    const req = new NextRequest(BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect((await PUT(req)).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE — remove a post
// ---------------------------------------------------------------------------
describe('admin posts — DELETE', () => {
  it('deletes by query param id and returns ok', async () => {
    const { queries } = stubFrom({ blog_posts: { error: null, count: 1 } });

    const res = await DELETE(deleteReq({ id: '7' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(queries.blog_posts.eq).toHaveBeenCalledWith('id', 7);
  });

  it('deletes by JSON body id when no query param is given', async () => {
    const { queries } = stubFrom({ blog_posts: { error: null, count: 1 } });

    const res = await DELETE(deleteReq({}, { id: 8 }));

    expect(res.status).toBe(200);
    expect(queries.blog_posts.eq).toHaveBeenCalledWith('id', 8);
  });

  it('returns 422 when no id is provided at all', async () => {
    stubFrom({ blog_posts: {} });
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(422);
  });

  it('returns 404 when the post does not exist', async () => {
    stubFrom({ blog_posts: { error: null, count: 0 } });

    const res = await DELETE(deleteReq({ id: '999' }));
    expect(res.status).toBe(404);
  });

  it('returns 500 on a database error', async () => {
    stubFrom({ blog_posts: { error: { message: 'db error' }, count: null } });

    const res = await DELETE(deleteReq({ id: '1' }));
    expect(res.status).toBe(500);
  });
});

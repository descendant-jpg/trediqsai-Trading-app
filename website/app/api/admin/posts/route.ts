import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types (local to this route)
// ---------------------------------------------------------------------------
type PostStatus = 'draft' | 'published' | 'archived';

interface PostInsert {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  asset_class: 'Forex' | 'Crypto' | 'Stocks';
  category: string;
  ai_badge: string;
  upvotes: number;
  status: PostStatus;
  author: string;
  cover_image?: string | null;
  tags: string[];
  published_at?: string | null;
}

interface PostUpdate extends Partial<PostInsert> {
  id: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_STATUSES: PostStatus[] = ['draft', 'published', 'archived'];
const VALID_ASSETS = ['Forex', 'Crypto', 'Stocks'] as const;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function deriveSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

function sanitizeTag(t: unknown): string {
  return String(t ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .slice(0, 50);
}

function db503() {
  console.warn('[admin/posts] Supabase service role key is not configured.');
  return NextResponse.json(
    { error: 'Database service is not configured.' },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------------
// GET — list all posts for admin (no public=1 filter; public endpoint is separate)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  let query = supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, content, asset_class, category, ai_badge, upvotes, status, author, tags, published_at, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && VALID_STATUSES.includes(status as PostStatus)) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[admin/posts] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch posts.' }, { status: 500 });
  }

  return NextResponse.json({ posts: data, total: count ?? 0, page, limit });
}

// ---------------------------------------------------------------------------
// POST — create a new post
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const title = String(b?.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'title is required.' }, { status: 422 });
  }

  const rawSlug = String(b?.slug ?? '').trim().toLowerCase();
  const slug = rawSlug && SLUG_RE.test(rawSlug) ? rawSlug : deriveSlug(title);
  if (!slug) {
    return NextResponse.json({ error: 'Could not derive a valid slug from the title.' }, { status: 422 });
  }

  const status: PostStatus = VALID_STATUSES.includes(b?.status as PostStatus)
    ? (b.status as PostStatus)
    : 'draft';
  const asset_class = VALID_ASSETS.includes(b?.asset_class as typeof VALID_ASSETS[number])
    ? (b.asset_class as typeof VALID_ASSETS[number])
    : 'Forex';

  const rawTags = Array.isArray(b?.tags) ? b.tags : [];
  const tags = rawTags.map(sanitizeTag).filter(Boolean);

  const insert: PostInsert = {
    title,
    slug,
    excerpt: String(b?.excerpt ?? '').trim(),
    content: String(b?.content ?? '').trim(),
    asset_class,
    category: String(b?.category ?? 'Analysis').trim().slice(0, 50),
    ai_badge: String(b?.ai_badge ?? '').trim().slice(0, 100),
    upvotes: Math.max(0, Number(b?.upvotes ?? 0) || 0),
    status,
    author: String(b?.author ?? '').trim() || 'TradiQs AI Quant Desk',
    cover_image: b?.cover_image ? String(b.cover_image).trim() : null,
    tags,
    published_at: status === 'published' && !b?.published_at ? new Date().toISOString() : (b?.published_at ? String(b.published_at) : null),
  };

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({ ...insert, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A post with that slug already exists.' }, { status: 409 });
    }
    console.error('[admin/posts] POST error:', error.message);
    return NextResponse.json(
      { error: 'Failed to create post. If this persists, confirm the blog_posts migration has been applied in Supabase.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ post: data }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PUT — update a post by id (id must be in the JSON body)
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const id = parseInt(String(b?.id ?? ''), 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ error: 'id is required in the JSON body.' }, { status: 422 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (b?.title !== undefined) {
    const title = String(b.title).trim();
    if (!title) return NextResponse.json({ error: 'title cannot be empty.' }, { status: 422 });
    update.title = title;
  }

  if (b?.slug !== undefined) {
    const rawSlug = String(b.slug).trim().toLowerCase();
    if (rawSlug && !SLUG_RE.test(rawSlug)) {
      return NextResponse.json({ error: 'Invalid slug format.' }, { status: 422 });
    }
    if (rawSlug) update.slug = rawSlug;
  }

  if (b?.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status as PostStatus)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}.` }, { status: 422 });
    }
    update.status = b.status;
    if (b.status === 'published' && !b.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  if (b?.excerpt !== undefined) update.excerpt = String(b.excerpt).trim();
  if (b?.content !== undefined) update.content = String(b.content).trim();
  if (b?.asset_class !== undefined && VALID_ASSETS.includes(b.asset_class as typeof VALID_ASSETS[number])) update.asset_class = b.asset_class;
  if (b?.category !== undefined) update.category = String(b.category).trim().slice(0, 50);
  if (b?.ai_badge !== undefined) update.ai_badge = String(b.ai_badge).trim().slice(0, 100);
  if (b?.upvotes !== undefined) update.upvotes = Math.max(0, Number(b.upvotes) || 0);
  if (b?.author !== undefined) update.author = String(b.author).trim();
  if (b?.cover_image !== undefined) update.cover_image = b.cover_image ? String(b.cover_image).trim() : null;
  if (b?.published_at !== undefined) update.published_at = b.published_at ? String(b.published_at) : null;

  if (b?.tags !== undefined) {
    const rawTags = Array.isArray(b.tags) ? b.tags : [];
    update.tags = rawTags.map(sanitizeTag).filter(Boolean);
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A post with that slug already exists.' }, { status: 409 });
    }
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }
    console.error('[admin/posts] PUT error:', error.message);
    return NextResponse.json({ error: 'Failed to update post.' }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}

// ---------------------------------------------------------------------------
// DELETE — delete a post by id (query param or JSON body)
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  let id: number | null = null;

  const qId = req.nextUrl.searchParams.get('id');
  if (qId) {
    id = parseInt(qId, 10);
  } else {
    try {
      const body = await req.json();
      id = parseInt(String((body as Record<string, unknown>)?.id ?? ''), 10);
    } catch {
      // no body is fine; id stays null
    }
  }

  if (!id || isNaN(id)) {
    return NextResponse.json({ error: 'id is required (query param or JSON body).' }, { status: 422 });
  }

  const { error, count } = await supabase
    .from('blog_posts')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('[admin/posts] DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to delete post.' }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

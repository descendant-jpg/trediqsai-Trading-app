import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../lib/supabase-server';

/**
 * Public read-only endpoint for blog posts.
 * Only returns published posts. No authentication required.
 * Supports query params: tag, slug, page, limit.
 */
export const dynamic = 'force-dynamic';

function db503() {
  console.warn('[api/posts] Supabase service role key is not configured.');
  return NextResponse.json(
    { error: 'Blog service is not configured yet. Please try again shortly.' },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PublicPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  author: string;
  cover_image: string | null;
  tags: string[];
  asset_class: 'Forex' | 'Crypto' | 'Stocks';
  category: string;
  ai_badge: string;
  upvotes: number;
  published_at: string;
  created_at: string;
}

// Full post (includes content) — only returned when a single slug is requested
interface PublicPostFull extends PublicPost {
  content: string;
}

// ---------------------------------------------------------------------------
// GET — public published posts
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  const { searchParams } = req.nextUrl;
  const slug = searchParams.get('slug');
  const tag = searchParams.get('tag');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
  const offset = (page - 1) * limit;

  // Single post by slug — return full content
  if (slug) {
    const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!safeSlug) {
      return NextResponse.json({ error: 'Invalid slug.' }, { status: 422 });
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, content, author, cover_image, tags, asset_class, category, ai_badge, upvotes, published_at, created_at')
      .eq('status', 'published')
      .eq('slug', safeSlug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
      }
      console.error('[api/posts] GET single error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch post.' }, { status: 500 });
    }

    return NextResponse.json({ post: data as PublicPostFull });
  }

  // List of published posts (no content field to keep payloads small)
  let query = supabase
    .from('blog_posts')
    .select(
      'id, title, slug, excerpt, author, cover_image, tags, asset_class, category, ai_badge, upvotes, published_at, created_at',
      { count: 'exact' },
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tag) {
    const safeTag = tag.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').slice(0, 50);
    if (safeTag) {
      // Postgres array contains operator
      query = query.contains('tags', [safeTag]);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[api/posts] GET list error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch posts.' }, { status: 500 });
  }

  return NextResponse.json({
    posts: (data as PublicPost[]) ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WaitlistRow {
  id: number;
  name: string | null;
  email: string;
  created_at: string;
}

function db503() {
  console.warn('[admin/waitlist] Supabase service role key is not configured.');
  return NextResponse.json(
    { error: 'Database service is not configured.' },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------------
// GET — paginated list of waitlist entries
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('waitlist')
    .select('id, name, email, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[admin/waitlist] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch waitlist.' }, { status: 500 });
  }

  return NextResponse.json({
    entries: (data as WaitlistRow[]) ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

// ---------------------------------------------------------------------------
// DELETE — remove an entry by id (query param or JSON body)
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
    .from('waitlist')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('[admin/waitlist] DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to delete entry.' }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

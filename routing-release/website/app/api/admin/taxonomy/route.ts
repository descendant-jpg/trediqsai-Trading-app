import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TermKind = 'category' | 'tag';
const VALID_KINDS: TermKind[] = ['category', 'tag'];

interface TermRow {
  id: number;
  name: string;
  kind: TermKind;
  created_at: string;
}

function db503() {
  console.warn('[admin/taxonomy] Supabase service role key is not configured.');
  return NextResponse.json(
    { error: 'Database service is not configured.' },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------------
// GET — list all taxonomy terms, optionally filtered by kind
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) return db503();

  const kind = req.nextUrl.searchParams.get('kind');

  let query = supabase
    .from('taxonomy_terms')
    .select('id, name, kind, created_at')
    .order('name', { ascending: true });

  if (kind && VALID_KINDS.includes(kind as TermKind)) {
    query = query.eq('kind', kind);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin/taxonomy] GET error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch taxonomy. If this persists, confirm the taxonomy_terms migration has been applied in Supabase.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ terms: (data as TermRow[]) ?? [] });
}

// ---------------------------------------------------------------------------
// POST — create a term (JSON body: { name, kind? })
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
  const name = String(b?.name ?? '').trim().slice(0, 50);
  if (!name) {
    return NextResponse.json({ error: 'name is required.' }, { status: 422 });
  }

  const kind: TermKind = VALID_KINDS.includes(b?.kind as TermKind) ? (b.kind as TermKind) : 'category';

  const { data, error } = await supabase
    .from('taxonomy_terms')
    .insert({ name, kind })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A ${kind} named "${name}" already exists.` }, { status: 409 });
    }
    console.error('[admin/taxonomy] POST error:', error.message);
    return NextResponse.json({ error: 'Failed to create term.' }, { status: 500 });
  }

  return NextResponse.json({ term: data }, { status: 201 });
}

// ---------------------------------------------------------------------------
// DELETE — remove a term by id (query param or JSON body)
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
    .from('taxonomy_terms')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('[admin/taxonomy] DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to delete term.' }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Term not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

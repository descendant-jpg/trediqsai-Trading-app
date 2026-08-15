import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MessageStatus = 'open' | 'resolved';
const VALID_STATUSES: MessageStatus[] = ['open', 'resolved'];

interface MessageRow {
  id: number;
  name: string;
  email: string;
  message: string;
  status: MessageStatus;
  created_at: string;
}

function db503() {
  console.warn('[admin/messages] Supabase service role key is not configured.');
  return NextResponse.json(
    { error: 'Database service is not configured.' },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------------
// GET — paginated list of contact messages
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
    .from('contact_messages')
    .select('id, name, email, message, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && VALID_STATUSES.includes(status as MessageStatus)) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[admin/messages] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch messages.' }, { status: 500 });
  }

  return NextResponse.json({
    messages: (data as MessageRow[]) ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

// ---------------------------------------------------------------------------
// PATCH — update status of a message by id (JSON body: { id, status })
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
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
    return NextResponse.json({ error: 'id is required.' }, { status: 422 });
  }

  const status = b?.status as string;
  if (!status || !VALID_STATUSES.includes(status as MessageStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}.` },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from('contact_messages')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    }
    console.error('[admin/messages] PATCH error:', error.message);
    return NextResponse.json({ error: 'Failed to update message status.' }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}

// ---------------------------------------------------------------------------
// DELETE — remove a message by id (query param or JSON body)
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
    .from('contact_messages')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('[admin/messages] DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to delete message.' }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

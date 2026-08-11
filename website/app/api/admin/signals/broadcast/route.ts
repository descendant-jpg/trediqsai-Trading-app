import { NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';

type BroadcastRequest = {
  signalId: string;
  asset: string;
  direction: 'BUY' | 'SELL';
  confidenceScore: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<BroadcastRequest>;
    if (!body.signalId || !body.asset || !body.direction || typeof body.confidenceScore !== 'number') {
      return NextResponse.json({ error: 'Invalid broadcast payload.' }, { status: 400 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: 'Server Supabase is not configured.' }, { status: 503 });

    const { data: profiles, error } = await supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
    if (error) throw error;
    const tokens = (profiles ?? []).map((profile) => profile.expo_push_token).filter((token): token is string => Boolean(token));
    if (!tokens.length) return NextResponse.json({ sent: 0 });

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({
        to,
        title: `🚨 New Signal: ${body.asset} ${body.direction}`,
        body: `AI Conviction: ${body.confidenceScore}%. Tap to view entry levels.`,
        data: { signal_id: body.signalId },
      }))),
    });
    if (!response.ok) throw new Error(`Expo push service returned ${response.status}.`);
    return NextResponse.json({ sent: tokens.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Broadcast failed.' }, { status: 500 });
  }
}
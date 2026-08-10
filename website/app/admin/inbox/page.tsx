import { Mail } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';
export default async function Inbox() {
  let messages: any[] = [];
  let errorMessage = '';
  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase is not configured.');
    const result = await supabase.from('contact_submissions').select('*').order('created_at', { ascending: false });
    if (result.error) throw result.error;
    messages = result.data ?? [];
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unable to load submissions.';
  }
  return <div className="p-5 md:p-8 lg:p-10"><p className="text-xs font-bold uppercase tracking-[.25em] text-cyan">Support operations</p><h1 className="mt-3 text-3xl font-black">Help Desk</h1>{errorMessage && <p className="mt-6 text-sm text-muted">{errorMessage}</p>}<div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-card"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase tracking-widest text-muted"><tr><th className="p-5">From</th><th>Message</th><th>Received</th><th>Status</th></tr></thead><tbody>{messages.map((message) => <tr className="border-b border-white/10 last:border-0" key={message.id}><td className="p-5"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan/10 text-cyan"><Mail className="h-4 w-4" /></span><div><p className="font-semibold">{message.name ?? 'Unknown'}</p><p className="text-xs text-muted">{message.email ?? '—'}</p></div></div></td><td className="max-w-md text-muted">{message.message}</td><td className="text-muted">{message.created_at ? new Date(message.created_at).toLocaleString() : '—'}</td><td><span className="rounded-full bg-cyan/10 px-2 py-1 text-[10px] font-bold text-cyan">{message.status ?? 'NEW'}</span></td></tr>)}</tbody></table>{!messages.length && !errorMessage && <p className="p-6 text-sm text-muted">No contact submissions yet.</p>}</div></div>;
}
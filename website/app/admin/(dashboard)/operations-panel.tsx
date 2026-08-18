'use client';

import { Download, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Lead = { id: string; name?: string; email: string; created_at: string };
type Message = { id: string; name: string; email: string; message: string; status: 'open' | 'resolved'; created_at: string };
type Comment = { id: string; author_name: string; content: string; status: 'pending' | 'approved'; created_at: string };

function format(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

/**
 * API routes return numeric database ids while these panels track ids as
 * strings. Normalize at the boundary so optimistic updates after mutations
 * match by strict equality.
 */
function normalizeId<T extends { id: unknown }>(item: T): T & { id: string } {
  return { ...item, id: String(item.id) };
}

async function fetchAll<T extends { id: unknown }>(path: string, key: string): Promise<(T & { id: string })[]> {
  const results: (T & { id: string })[] = [];
  const limit = 200;
  let page = 1;
  let total = Infinity;
  while (results.length < total) {
    const separator = path.includes('?') ? '&' : '?';
    const res = await fetch(`${path}${separator}page=${page}&limit=${limit}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Unable to load records.');
    const batch = (body[key] ?? []) as T[];
    results.push(...batch.map(normalizeId));
    total = Number(body.total ?? results.length);
    if (!batch.length) break;
    page += 1;
  }
  return results;
}

export function WaitlistPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Loading leads…');
  const load = async () => {
    try {
      setLeads(await fetchAll<Lead>('/api/admin/waitlist', 'entries'));
      setStatus('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to load leads.'); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => leads.filter((lead) => `${lead.name ?? ''} ${lead.email}`.toLowerCase().includes(query.toLowerCase())), [leads, query]);
  const download = () => {
    const data = ['Name,Email,Date', ...visible.map((lead) => `"${(lead.name ?? '').replaceAll('"', '""')}","${lead.email.replaceAll('"', '""')}","${lead.created_at}"`)].join('\n');
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tradiqs-waitlist.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this waitlist lead?')) return;
    const res = await fetch(`/api/admin/waitlist?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setLeads((items) => items.filter((item) => item.id !== id)); else setStatus('Unable to delete this lead.');
  };
  return <div className="p-5 md:p-8 lg:p-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Launch leads</p><h1 className="mt-3 text-3xl font-black">Waitlist Leads</h1></div><button onClick={download} className="flex items-center gap-2 rounded-xl bg-[#FFD700] px-4 py-3 text-sm font-bold text-black"><Download className="h-4 w-4" /> Export CSV</button></div><div className="mt-7 flex items-center gap-2 rounded-xl border border-gray-800 bg-[#111111] px-4 py-3"><Search className="h-4 w-4 text-gray-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search name or email" /></div>{status && <p className="mt-5 text-sm text-gray-400">{status}</p>}<div className="mt-4 overflow-x-auto rounded-2xl border border-gray-800 bg-[#111111]"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500"><tr><th className="p-5">Name</th><th>Email</th><th>Date</th><th /></tr></thead><tbody>{!visible.length && !status && <tr><td colSpan={4} className="p-8 text-sm text-gray-400">{query ? 'No leads match your search.' : 'No waitlist leads yet.'}</td></tr>}{visible.map((lead) => <tr className="border-b border-gray-800 last:border-0" key={lead.id}><td className="p-5 font-semibold">{lead.name || '—'}</td><td className="text-gray-400">{lead.email}</td><td className="text-gray-500">{format(lead.created_at)}</td><td><button onClick={() => void remove(lead.id)} className="text-gray-500 hover:text-red-400" aria-label={`Delete ${lead.email}`}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></div>;
}

export function MessagesPanel() {
  const [items, setItems] = useState<Message[]>([]);
  const [status, setStatus] = useState('Loading messages…');
  const load = async () => { try { setItems(await fetchAll<Message>('/api/admin/messages', 'messages')); setStatus(''); } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to load messages.'); } };
  useEffect(() => { void load(); }, []);
  const change = async (item: Message) => { const next = item.status === 'open' ? 'resolved' : 'open'; const res = await fetch('/api/admin/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status: next }) }); if (res.ok) setItems((list) => list.map((value) => value.id === item.id ? { ...value, status: next } : value)); else setStatus('Unable to update ticket.'); };
  const remove = async (id: string) => { if (!window.confirm('Delete this support ticket?')) return; const res = await fetch(`/api/admin/messages?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); if (res.ok) setItems((list) => list.filter((item) => item.id !== id)); else setStatus('Unable to delete ticket.'); };
  return <div className="p-5 md:p-8 lg:p-10"><p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Support operations</p><h1 className="mt-3 text-3xl font-black">Help Desk</h1>{status && <p className="mt-5 text-sm text-gray-400">{status}</p>}<div className="mt-7 grid gap-4">{items.map((item) => <article className="rounded-2xl border border-gray-800 bg-[#111111] p-5" key={item.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-bold text-white">{item.name}</p><p className="text-sm text-gray-500">{item.email} · {format(item.created_at)}</p></div><div className="flex gap-2"><button onClick={() => void change(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.status === 'open' ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}>{item.status === 'open' ? 'Open' : 'Resolved'}</button><button onClick={() => void remove(item.id)} className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-300">{item.message}</p></article>)}{!items.length && !status && <div className="rounded-2xl border border-gray-800 bg-[#111111] p-8 text-sm text-gray-400">No pending support tickets.</div>}</div></div>;
}

export function CommentsPanel() {
  const [items, setItems] = useState<Comment[]>([]);
  const [status, setStatus] = useState('Loading moderation queue…');
  const load = async () => { try { const comments = await fetchAll<{ body?: string; content?: string } & Comment>('/api/admin/comments', 'comments'); setItems(comments.map((item) => ({ ...item, content: item.content ?? item.body ?? '' }))); setStatus(''); } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to load comments.'); } };
  useEffect(() => { void load(); }, []);
  const approve = async (id: string) => { const res = await fetch('/api/admin/comments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'approved' }) }); if (res.ok) setItems((items) => items.map((item) => item.id === id ? { ...item, status: 'approved' } : item)); else setStatus('Unable to approve comment.'); };
  const remove = async (id: string) => { const res = await fetch(`/api/admin/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); if (res.ok) setItems((items) => items.filter((item) => item.id !== id)); else setStatus('Unable to delete comment.'); };
  return <div className="p-5 md:p-8 lg:p-10"><p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Community safety</p><h1 className="mt-3 text-3xl font-black">Comments Moderation</h1>{status && <p className="mt-5 text-sm text-gray-400">{status}</p>}<div className="mt-7 grid gap-4">{items.map((item) => <article className="rounded-2xl border border-gray-800 bg-[#111111] p-5" key={item.id}><div className="flex justify-between gap-4"><div><p className="font-bold">{item.author_name}</p><p className="mt-1 text-xs text-gray-500">{format(item.created_at)}</p></div><span className={`h-fit rounded-full px-2 py-1 text-[10px] font-bold ${item.status === 'approved' ? 'bg-green-400/10 text-green-400' : 'bg-[#FFD700]/10 text-[#FFD700]'}`}>{item.status}</span></div><p className="mt-4 text-sm text-gray-300">{item.content}</p><div className="mt-5 flex gap-3"><button onClick={() => void approve(item.id)} disabled={item.status === 'approved'} className="rounded-lg bg-[#00FFFF] px-3 py-2 text-xs font-bold text-black disabled:opacity-40">Approve</button><button onClick={() => void remove(item.id)} className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-red-400">Delete</button></div></article>)}{!items.length && !status && <div className="rounded-2xl border border-dashed border-gray-800 bg-[#111111] p-10 text-center"><p className="text-sm font-semibold text-gray-300">Moderation queue is clear</p><p className="mt-1 text-sm text-gray-500">New reader comments will appear here for review.</p></div>}</div></div>;
}
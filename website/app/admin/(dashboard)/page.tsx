import Link from 'next/link';
import { FilePlus2, HelpCircle, Newspaper, UserPlus, Users } from 'lucide-react';
import { getSupabaseServer } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

type RecentPost = { id: number; title: string; status: string; created_at: string };

export default async function AdminDashboard() {
  let waitlist = 0; let subscribers = 0; let insights = 0; let tickets = 0; let recent: RecentPost[] = [];
  try {
    const db = getSupabaseServer();
    if (db) {
      const [leads, paid, posts, openTickets, recentPosts] = await Promise.all([
        db.from('waitlist').select('*', { count: 'exact', head: true }),
        db.from('profiles').select('*', { count: 'exact', head: true }).in('tier', ['pro', 'elite', 'whale', 'vip']),
        db.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        db.from('contact_messages').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        db.from('blog_posts').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(5),
      ]);
      waitlist = leads.count ?? 0; subscribers = paid.count ?? 0; insights = posts.count ?? 0; tickets = openTickets.count ?? 0; recent = (recentPosts.data ?? []) as RecentPost[];
    }
  } catch { /* Individual modules surface their own safe database errors. */ }
  const metrics = [['Total Waitlist Signups', waitlist, UserPlus], ['Active Pro / Elite Subscribers', subscribers, Users], ['Published Market Insights', insights, Newspaper], ['Open Support Tickets', tickets, HelpCircle]] as const;
  return <div className="p-5 md:p-8 lg:p-10"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Command center</p><h1 className="mt-3 text-3xl font-black">TradiQs CMS</h1><p className="mt-2 text-sm text-gray-400">Live operational intelligence from your production workspace.</p></div><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, Icon]) => <div className="rounded-2xl border border-gray-800 bg-[#111111] p-5" key={label}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00FFFF]/10 text-[#00FFFF]"><Icon className="h-4 w-4" /></span><p className="mt-7 text-xs uppercase tracking-widest text-gray-500">{label}</p><p className="mt-2 text-3xl font-bold">{value.toLocaleString()}</p></div>)}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_.6fr]"><section className="rounded-2xl border border-gray-800 bg-[#111111] p-6"><div className="flex items-center justify-between"><h2 className="font-bold">Recent Posts</h2><Link className="text-sm font-semibold text-[#00FFFF]" href="/admin/blog">Manage insights</Link></div><div className="mt-4 divide-y divide-gray-800">{recent.length ? recent.map((post) => <div className="flex items-center justify-between gap-4 py-4" key={post.id}><div><p className="font-semibold">{post.title}</p><p className="mt-1 text-xs text-gray-500">{new Date(post.created_at).toLocaleDateString()} · {post.status}</p></div><Link href="/admin/blog" className="text-sm text-[#00FFFF]">Edit</Link></div>) : <p className="py-8 text-sm text-gray-400">No market insights published yet.</p>}</div></section><section className="rounded-2xl border border-gray-800 bg-[#111111] p-6"><h2 className="font-bold">Quick Actions</h2><div className="mt-4 grid gap-3"><Link href="/admin/blog" className="flex items-center gap-3 rounded-xl border border-gray-700 p-4 text-sm hover:border-[#00FFFF]"><FilePlus2 className="h-4 w-4 text-[#00FFFF]" /> + Write New Post</Link><Link href="/admin/waitlist" className="rounded-xl border border-gray-700 p-4 text-sm hover:border-[#00FFFF]">View Waitlist</Link><Link href="/admin/inbox" className="rounded-xl border border-gray-700 p-4 text-sm hover:border-[#00FFFF]">Check Help Desk</Link></div></section></div></div>;
}
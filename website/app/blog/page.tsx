import Link from 'next/link';
import { getSupabase } from '../../lib/supabase';

export const dynamic = 'force-dynamic';
export default async function Blog() {
  let posts: any[] = [];
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.from('blog_posts').select('*').eq('published', true).order('created_at', { ascending: false });
      if (!error) posts = data ?? [];
    }
  } catch {}
  return <main className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><p className="text-xs font-bold uppercase tracking-[.25em] text-cyan">From the desk</p><h1 className="mt-4 text-5xl font-black tracking-tight">Market intelligence, made readable.</h1><div className="mt-14 grid gap-5 md:grid-cols-2">{posts.length ? posts.map((p, i) => <Link href={`/blog/${p.slug}`} key={p.id ?? p.slug} className="glass rounded-3xl p-7 transition hover:-translate-y-1 hover:border-cyan/50"><div className={`mb-16 h-40 rounded-2xl ${i % 2 ? 'bg-gradient-to-br from-purple-500/30 to-cyan/10' : 'bg-gradient-to-br from-cyan/30 to-blue-500/10'}`} /><p className="text-xs font-bold tracking-widest text-cyan">{p.category ?? 'MARKET INSIGHT'}</p><h2 className="mt-3 text-2xl font-bold">{p.title}</h2><p className="mt-5 text-xs text-muted">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</p></Link>) : <div className="glass rounded-3xl p-8 text-muted">No published articles yet.</div>}</div></main>;
}
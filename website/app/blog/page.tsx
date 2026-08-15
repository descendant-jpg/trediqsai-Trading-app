'use client';

import { ArrowBigDown, ArrowBigUp, MessageCircle, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type Asset = 'Forex' | 'Crypto' | 'Stocks';
type Sort = 'Hot' | 'New' | 'Top';

const posts: Array<{
  title: string;
  excerpt: string;
  asset: Asset;
  votes: number;
  comments: number;
  timestamp: string;
  badges: string[];
  hot: number;
  top: number;
}> = [
  { title: 'Gold holds above the London range as real yields soften', excerpt: 'XAU/USD is compressing above a defended intraday base. Our desk is watching the 2,420 area for continuation confirmation.', asset: 'Forex', votes: 428, comments: 62, timestamp: '2h ago', badges: ['🟢 BULLISH BIAS', '⚡ AI CONFIDENCE 94%'], hot: 98, top: 428 },
  { title: 'Bitcoin liquidity map signals a decisive range expansion', excerpt: 'BTC/USD order-flow clusters have tightened near the weekly midpoint. A close beyond the current range may set the next directional leg.', asset: 'Crypto', votes: 387, comments: 88, timestamp: '3h ago', badges: ['⚡ AI CONFIDENCE 91%', '⚠️ HIGH IMPACT'], hot: 95, top: 387 },
  { title: 'NVIDIA earnings positioning: volatility premium remains elevated', excerpt: 'Options pricing reflects a broad expected move. Stocks desk members are tracking sector sympathy and key pre-market liquidity levels.', asset: 'Stocks', votes: 312, comments: 45, timestamp: '5h ago', badges: ['⚠️ HIGH IMPACT', '🟢 BULLISH BIAS'], hot: 89, top: 312 },
  { title: 'EUR/USD momentum stalls near resistance into the US session', excerpt: 'Forex flows remain balanced, but the pair needs a clean reclaim of resistance before a higher-conviction bullish thesis is valid.', asset: 'Forex', votes: 241, comments: 31, timestamp: '6h ago', badges: ['⚡ AI CONFIDENCE 86%'], hot: 82, top: 241 },
  { title: 'Ethereum rotation watch: spot demand meets a key weekly level', excerpt: 'Crypto breadth is improving, while ETH/USD tests a level that has repeatedly defined the market’s medium-term structure.', asset: 'Crypto', votes: 198, comments: 27, timestamp: '8h ago', badges: ['🟢 BULLISH BIAS'], hot: 76, top: 198 },
];

const badgeClass = (badge: string) => badge.includes('BULLISH') ? 'border-green-400/30 bg-green-400/10 text-green-300' : badge.includes('HIGH') ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200' : 'border-[#00FFFF]/30 bg-[#00FFFF]/10 text-[#00FFFF]';

export default function Blog() {
  const [asset, setAsset] = useState<'All' | Asset>('All');
  const [sort, setSort] = useState<Sort>('Hot');
  const [voted, setVoted] = useState<Record<string, number>>({});

  const visiblePosts = useMemo(() => posts
    .filter((post) => asset === 'All' || post.asset === asset)
    .sort((a, b) => sort === 'Hot' ? b.hot - a.hot : sort === 'Top' ? b.top - a.top : posts.indexOf(a) - posts.indexOf(b)), [asset, sort]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-16 lg:px-8">
      <div className="border-b border-gray-800 pb-8">
        <p className="text-xs font-bold uppercase tracking-[.25em] text-[#00FFFF]">Market intelligence feed</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-5xl">The institutional market room.</h1>
        <p className="mt-4 max-w-2xl leading-7 text-gray-400">A continuously updated desk feed for the Forex, Crypto, and Stocks conversations that matter.</p>
      </div>

      <div className="mt-7 flex flex-wrap gap-2" aria-label="Asset filters">
        {(['All', 'Forex', 'Crypto', 'Stocks'] as const).map((filter) => <button key={filter} onClick={() => setAsset(filter)} className={`rounded-full border px-4 py-2 text-sm font-bold transition ${asset === filter ? 'border-[#00FFFF] bg-[#00FFFF] text-black' : 'border-gray-800 bg-[#111111] text-gray-400 hover:border-gray-600 hover:text-white'}`}>{filter}</button>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-b border-gray-800 pb-7" aria-label="Sort posts">
        {([{ label: '🔥 Hot', value: 'Hot' }, { label: '⚡ New', value: 'New' }, { label: '🏆 Top', value: 'Top' }] as const).map(({ label, value }) => <button key={value} onClick={() => setSort(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${sort === value ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>{label}</button>)}
      </div>

      <section className="mt-7 grid gap-4">
        {visiblePosts.map((post) => {
          const vote = voted[post.title] ?? 0;
          return <article className="grid grid-cols-[48px_1fr] gap-3 rounded-2xl border border-gray-800 bg-[#111111] p-4 md:p-5" key={post.title}>
            <div className="flex flex-col items-center pt-1 text-gray-500">
              <button onClick={() => setVoted((current) => ({ ...current, [post.title]: vote === 1 ? 0 : 1 }))} aria-label={`Upvote ${post.title}`} className={vote === 1 ? 'text-[#FFD700]' : 'hover:text-white'}><ArrowBigUp className="h-7 w-7" /></button>
              <span className="py-1 text-sm font-bold text-white">{post.votes + vote}</span>
              <button onClick={() => setVoted((current) => ({ ...current, [post.title]: vote === -1 ? 0 : -1 }))} aria-label={`Downvote ${post.title}`} className={vote === -1 ? 'text-red-400' : 'hover:text-white'}><ArrowBigDown className="h-7 w-7" /></button>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><span className="font-bold uppercase tracking-wider text-[#00FFFF]">{post.asset}</span><span>•</span><span>{post.timestamp}</span></div>
              <h2 className="mt-2 text-xl font-bold text-white">{post.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">{post.excerpt}</p>
              <div className="mt-4 flex flex-wrap gap-2">{post.badges.map((badge) => <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${badgeClass(badge)}`} key={badge}>{badge}</span>)}</div>
              <div className="mt-5 flex items-center gap-5 text-sm font-semibold text-gray-500"><button className="flex items-center gap-2 transition hover:text-white"><MessageCircle className="h-4 w-4" />{post.comments} Comments</button><button className="flex items-center gap-2 transition hover:text-white"><Share2 className="h-4 w-4" />Share</button></div>
            </div>
          </article>;
        })}
      </section>

      <section className="mt-10 rounded-2xl border border-gray-800 bg-[#111111] p-6 md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#00FFFF]">Embeddable tools</p><h2 className="mt-2 text-2xl font-bold text-white">Economic Calendar</h2><p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">Place a focused, dark-mode macro calendar on your trading workspace.</p></div><button className="w-fit rounded-lg bg-[#FFD700] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-yellow-400">Copy Embed Code</button></div>
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-800 bg-black">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-gray-800 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500"><span>Event</span><span>Time</span><span>Impact</span></div>
          {[['US CPI Inflation Rate', '12:30 UTC', 'HIGH'], ['ECB President Speech', '13:15 UTC', 'MED'], ['US Retail Sales', '14:00 UTC', 'HIGH']].map(([event, time, impact]) => <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-gray-900 px-4 py-3 text-sm text-gray-300 last:border-0" key={event}><span>{event}</span><span className="text-gray-500">{time}</span><span className={impact === 'HIGH' ? 'font-bold text-red-400' : 'font-bold text-yellow-300'}>{impact}</span></div>)}
        </div>
      </section>
    </main>
  );
}
import Link from 'next/link';
import { BarChart3, Bot, BrainCircuit, ChevronDown, Download, Gauge, ShieldCheck } from 'lucide-react';

const ticker = [
  ['BTC/USDT', '$67,420.00', '+4.82%', 'text-green-400'],
  ['ETH/USDT', '$3,842.18', '+2.64%', 'text-green-400'],
  ['EUR/USD', '1.0842', '+0.42%', 'text-green-400'],
  ['GBP/USD', '1.2710', '-0.18%', 'text-red-400'],
  ['XAU/USD', '$2,348.60', '+0.31%', 'text-green-400'],
  ['SOL/USDT', '$184.22', '-1.06%', 'text-red-400'],
];

const features = [
  [BrainCircuit, 'AI Signal Generator', 'Turn market structure into clear BUY or SELL ideas with entry, targets, and invalidation.'],
  [Bot, 'AutoPilot Bots', 'Deploy disciplined GRID and DCA strategies that keep working while you focus on the bigger picture.'],
  [ShieldCheck, 'Risk Management', 'Size every position with precision and know your downside before the market moves.'],
];

const questions = [
  'How accurate are the AI Signals?',
  'What brokers do you support?',
  'Is TradiQs AI suitable for beginners?',
  'Does AutoPilot trade with real money?',
];

export default function Home() {
  return (
    <div className="flex min-h-screen w-full bg-[#0A0B0E] text-white">
      <aside className="fixed inset-y-0 left-0 z-30 flex h-screen w-20 flex-col justify-between border-r border-gray-800 bg-[#16181D] p-4 md:w-64 md:p-6">
        <div>
          <Link href="/" className="text-center text-lg font-extrabold text-[#00F0FF] md:text-left md:text-2xl">
            <span className="md:hidden">TQ</span>
            <span className="hidden md:inline">TradiQs AI</span>
          </Link>
          <nav className="mt-12 hidden gap-3 md:grid">
            <Link href="/about" className="rounded-lg px-3 py-2 text-sm text-gray-400 transition hover:bg-white/5 hover:text-[#00F0FF]">About</Link>
            <Link href="/blog" className="rounded-lg px-3 py-2 text-sm text-gray-400 transition hover:bg-white/5 hover:text-[#00F0FF]">Market Insights</Link>
            <Link href="/contact" className="rounded-lg px-3 py-2 text-sm text-gray-400 transition hover:bg-white/5 hover:text-[#00F0FF]">Contact</Link>
          </nav>
        </div>
        <div className="hidden md:block">
          <p className="mb-4 text-xs font-bold tracking-widest text-gray-400">GET THE APP</p>
          <div className="grid gap-3">
            <Link href="/contact" className="rounded-xl border border-white bg-black px-4 py-3 text-xs font-semibold transition hover:border-[#00F0FF]"> App Store</Link>
            <Link href="/contact" className="rounded-xl border border-white bg-black px-4 py-3 text-xs font-semibold transition hover:border-[#00F0FF]">▶ Google Play</Link>
          </div>
        </div>
        <Download className="mx-auto h-5 w-5 text-[#00F0FF] md:hidden" />
      </aside>

      <main className="ml-20 flex min-h-screen flex-1 flex-col md:ml-64">
        <section className="flex min-h-[80vh] flex-col items-center justify-center p-8 text-center md:p-12">
          <p className="mb-4 text-sm tracking-widest text-[#00F0FF]">MARKET INTELLIGENCE, REIMAGINED</p>
          <h1 className="mb-6 max-w-5xl text-5xl font-extrabold leading-tight md:text-7xl">The Institutional Edge in Your Pocket</h1>
          <p className="max-w-2xl text-xl text-gray-400">Trade with the clarity of a desk and the discipline of a system.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/contact" className="flex items-center gap-2 rounded-full bg-[#00F0FF] px-6 py-3 font-semibold text-black transition hover:bg-white"><Download className="h-5 w-5" /> Download the app</Link>
            <Link href="/about" className="rounded-full border border-[#00F0FF] px-6 py-3 font-semibold transition hover:bg-[#00F0FF] hover:text-black">See how it works</Link>
          </div>
        </section>

        <div className="flex w-full space-x-8 overflow-hidden border-y border-gray-800 bg-[#16181D] px-6 py-3 font-mono text-sm text-gray-300">
          {ticker.map(([pair, price, change, color]) => <div className="flex min-w-max gap-3" key={pair}><span className="font-semibold text-white">{pair}</span><span>{price}</span><span className={color}>{change}</span></div>)}
        </div>

        <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 p-8 md:grid-cols-3 md:p-12">
          {features.map(([Icon, title, description]) => <article className="rounded-2xl border border-gray-800 bg-[#16181D] p-8 transition-all hover:border-[#00F0FF]" key={title as string}><Icon className="mb-12 h-9 w-9 text-[#00F0FF]" /><h2 className="text-xl font-bold">{title as string}</h2><p className="mt-4 leading-7 text-gray-400">{description as string}</p></article>)}
        </section>

        <section className="mx-auto flex w-full max-w-4xl flex-col p-8 md:p-12">
          <div className="mb-8 text-center"><Gauge className="mx-auto mb-4 h-8 w-8 text-[#00F0FF]" /><h2 className="text-3xl font-bold">Questions, answered.</h2></div>
          {questions.map((question) => <details className="group border-b border-gray-800 py-6" key={question}><summary className="flex cursor-pointer list-none items-center justify-between font-bold text-white">{question}<ChevronDown className="h-5 w-5 text-[#00F0FF] transition group-open:rotate-180" /></summary><p className="pt-4 text-sm leading-7 text-gray-400">TradiQs AI combines market structure, momentum, liquidity, and risk context into a transparent trading workflow. Always validate ideas and manage your own risk.</p></details>)}
        </section>

        <footer className="mt-20 border-t border-gray-800 bg-[#0A0B0E] px-8 py-16 md:px-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2"><p className="text-2xl font-bold text-white">TradiQs<span className="text-[#00F0FF]"> AI</span></p><p className="mt-4 max-w-sm text-sm leading-6 text-gray-400">Institutional-grade market intelligence, built for traders who refuse to guess.</p></div>
            <div><h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">Explore</h3><div className="grid gap-3 text-sm"><Link href="/about" className="text-gray-400 transition-colors hover:text-[#00F0FF]">About</Link><Link href="/contact" className="text-gray-400 transition-colors hover:text-[#00F0FF]">Contact</Link></div></div>
            <div><h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">Legal</h3><div className="grid gap-3 text-sm"><Link href="/privacy" className="text-gray-400 transition-colors hover:text-[#00F0FF]">Privacy Policy</Link><Link href="/terms" className="text-gray-400 transition-colors hover:text-[#00F0FF]">Terms &amp; Conditions</Link></div></div>
          </div>
        </footer>
      </main>
    </div>
  );
}
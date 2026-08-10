import Link from 'next/link';
import { ArrowRight, BarChart3, Bot, BrainCircuit, ChevronDown, Download } from 'lucide-react';

const tickerItems: Array<[string, string, string, boolean]> = [
  ['BTC/USDT', '$67,420.00', '+4.82%', true],
  ['ETH/USDT', '$3,842.18', '+2.64%', true],
  ['EUR/USD', '1.0842', '+0.42%', true],
  ['GBP/USD', '1.2710', '-0.18%', false],
  ['XAU/USD', '$2,348.60', '+0.31%', true],
  ['SOL/USDT', '$184.22', '-1.06%', false],
];

const features = [
  {
    icon: BrainCircuit,
    title: 'AI Signal Generator',
    description: 'Turn market structure into clear BUY or SELL ideas with entry, targets, and invalidation.',
  },
  {
    icon: Bot,
    title: 'AutoPilot Bots',
    description: 'Deploy disciplined GRID and DCA strategies that keep working while you focus on the bigger picture.',
  },
  {
    icon: BarChart3,
    title: 'Risk Management',
    description: 'Size every position with precision and know your downside before the market moves.',
  },
];

const faqs = [
  'How accurate are the AI Signals?',
  'What brokers do you support?',
  'Is TradiQs AI suitable for beginners?',
  'Does AutoPilot trade with real money?',
];

export default function Home() {
  return (
    <main className="bg-[#0A0B0E] text-white">
      <section className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#00F0FF]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#00F0FF]" />
          Market intelligence, reimagined
        </div>
        <h1 className="max-w-5xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
          The Institutional Edge in Your Pocket
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-400">
          Trade with the clarity of a desk, the discipline of a system, and the intelligence of an always-on analyst.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/contact"
            className="flex items-center gap-2 rounded-full bg-[#00F0FF] px-6 py-3 font-semibold text-black transition hover:bg-white"
          >
            <Download className="h-5 w-5" />
            Download the app
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/about"
            className="rounded-full border border-[#00F0FF] px-6 py-3 font-semibold text-white transition hover:bg-[#00F0FF] hover:text-black"
          >
            See how it works
          </Link>
        </div>
      </section>

      <div className="sticky top-0 z-20 overflow-hidden border-y border-gray-800 bg-[#16181D]">
        <div className="flex min-w-max items-center gap-10 px-6 py-4">
          {tickerItems.map(([pair, price, change, positive]) => (
            <div className="flex items-center gap-3 text-sm" key={pair}>
              <span className="font-semibold text-white">{pair}</span>
              <span className="text-gray-400">{price}</span>
              <span className={positive ? 'text-green-400' : 'text-red-400'}>{change}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#00F0FF]">The edge</p>
            <h2 className="text-3xl font-bold md:text-5xl">Everything serious traders need, without the noise.</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article
                className="rounded-xl border border-gray-800 bg-[#16181D] p-8 transition-all duration-300 hover:border-[#00F0FF]"
                key={title}
              >
                <Icon className="mb-12 h-9 w-9 text-[#00F0FF]" />
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-4 leading-7 text-gray-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto flex max-w-3xl flex-col">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#00F0FF]">FAQ</p>
            <h2 className="text-3xl font-bold">Questions, answered.</h2>
          </div>
          {faqs.map((question) => (
            <details className="group border-b border-gray-800" key={question}>
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-bold">
                {question}
                <ChevronDown className="h-5 w-5 text-[#00F0FF] transition group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-sm leading-7 text-gray-400">
                TradiQs AI combines market structure, momentum, liquidity, and risk context into a transparent trading workflow. Always validate ideas and manage your own risk.
              </p>
            </details>
          ))}
        </div>
      </section>

      <footer className="bg-black px-4 py-12 text-gray-400">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-4 text-xl font-bold text-white">TradiQs<span className="text-[#00F0FF]">AI</span></div>
            <p className="max-w-sm text-sm leading-6">Institutional-grade market intelligence, built for traders who refuse to guess.</p>
          </div>
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">Explore</h3>
            <div className="grid gap-3 text-sm">
              <Link className="hover:text-[#00F0FF]" href="/about">About</Link>
              <Link className="hover:text-[#00F0FF]" href="/blog">Market insights</Link>
              <Link className="hover:text-[#00F0FF]" href="/contact">Contact</Link>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">Legal</h3>
            <div className="grid gap-3 text-sm">
              <Link className="hover:text-[#00F0FF]" href="/privacy">Privacy Policy</Link>
              <Link className="hover:text-[#00F0FF]" href="/terms">Terms of Service</Link>
              <a className="hover:text-[#00F0FF]" href="mailto:support@trediqsAI.com">Contact support</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
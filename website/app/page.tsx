import Link from 'next/link';
import {
  Apple,
  Bot,
  BrainCircuit,
  ChevronDown,
  Download,
  Gauge,
  Play,
  ShieldCheck,
} from 'lucide-react';

const ticker = [
  { pair: 'BTC/USDT', price: '$67,420.00', change: '+4.82%', positive: true },
  { pair: 'ETH/USDT', price: '$3,842.18', change: '+2.64%', positive: true },
  { pair: 'EUR/USD', price: '1.0842', change: '+0.42%', positive: true },
  { pair: 'GBP/USD', price: '1.2710', change: '-0.18%', positive: false },
  { pair: 'XAU/USD', price: '$2,348.60', change: '+0.31%', positive: true },
  { pair: 'SOL/USDT', price: '$184.22', change: '-1.06%', positive: false },
];

const features = [
  {
    icon: BrainCircuit,
    title: 'AI Signal Generator',
    description:
      'Turn market structure into clear BUY or SELL ideas with entry, targets, and invalidation.',
  },
  {
    icon: Bot,
    title: 'AutoPilot Bots',
    description:
      'Deploy disciplined GRID and DCA strategies that keep working while you focus on the bigger picture.',
  },
  {
    icon: ShieldCheck,
    title: 'Risk Management',
    description:
      'Size every position with precision and know your downside before the market moves.',
  },
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
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col justify-between border-r border-white/10 bg-[#12141A] p-8">
        <div>
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-[#00F0FF]"
          >
            TradiQs AI
          </Link>
          <nav className="mt-12 grid gap-3">
            <Link
              href="/about"
              className="rounded-lg px-3 py-2 text-sm text-white/40 transition hover:bg-white/5 hover:text-[#00F0FF]"
            >
              About
            </Link>
            <Link
              href="/blog"
              className="rounded-lg px-3 py-2 text-sm text-white/40 transition hover:bg-white/5 hover:text-[#00F0FF]"
            >
              Market Insights
            </Link>
            <Link
              href="/contact"
              className="rounded-lg px-3 py-2 text-sm text-white/40 transition hover:bg-white/5 hover:text-[#00F0FF]"
            >
              Contact
            </Link>
          </nav>
        </div>
        <div>
          <p className="mb-4 text-xs font-bold tracking-[0.2em] text-white/40">GET THE APP</p>
          <div className="grid gap-3">
            <Link
              href="/contact"
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-white/20 bg-black px-4 py-3 transition-colors hover:border-[#00F0FF]"
            >
              <Apple className="h-5 w-5" />
              <span className="text-left text-xs font-semibold">App Store</span>
            </Link>
            <Link
              href="/contact"
              className="flex w-full items-center gap-3 rounded-xl border border-white/20 bg-black px-4 py-3 transition-colors hover:border-[#00F0FF]"
            >
              <Play className="h-5 w-5 fill-current" />
              <span className="text-left text-xs font-semibold">Google Play</span>
            </Link>
          </div>
        </div>
      </aside>

      <main className="ml-64 flex min-h-screen flex-1 flex-col bg-[#0A0B0E]">
        <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-8 text-center">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
            MARKET INTELLIGENCE, REIMAGINED
          </p>
          <h1 className="mb-8 max-w-5xl bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent lg:text-7xl">
            The Institutional Edge in Your Pocket.
          </h1>
          <p className="mb-12 max-w-2xl text-xl text-white/50">
            Trade with the clarity of a desk and the discipline of a system.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/contact"
              className="flex items-center gap-2 rounded-full bg-[#00F0FF] px-8 py-4 font-semibold text-black transition-all hover:bg-cyan-400"
            >
              <Download className="h-5 w-5" />
              Download the app
            </Link>
            <Link
              href="/about"
              className="rounded-full border border-white/10 bg-white/5 px-8 py-4 font-semibold text-white transition-all hover:bg-white/10"
            >
              See how it works
            </Link>
          </div>
        </section>

        <div className="flex w-full gap-8 overflow-hidden border-y border-white/10 bg-[#12141A] px-8 py-4 font-mono text-sm text-white/60">
          {ticker.map((item) => (
            <div className="flex min-w-max gap-3" key={item.pair}>
              <span className="font-semibold text-white">{item.pair}</span>
              <span>{item.price}</span>
              <span className={item.positive ? 'text-emerald-400' : 'text-red-400'}>
                {item.change}
              </span>
            </div>
          ))}
        </div>

        <section className="mx-auto w-full max-w-6xl px-8 py-24">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Everything serious traders need.
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article
                className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#16181D] to-[#12141A] p-8 transition-all hover:border-[#00F0FF]/50"
                key={title}
              >
                <Icon className="mb-12 h-9 w-9 text-[#00F0FF]" />
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-4 leading-7 text-white/50">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-4xl flex-col px-8 pb-24">
          <div className="mb-8 text-center">
            <Gauge className="mx-auto mb-4 h-8 w-8 text-[#00F0FF]" />
            <h2 className="text-3xl font-bold">Questions, answered.</h2>
          </div>
          {questions.map((question) => (
            <details className="group border-b border-white/10 py-6" key={question}>
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-white">
                {question}
                <ChevronDown className="h-5 w-5 text-[#00F0FF] transition group-open:rotate-180" />
              </summary>
              <p className="pt-4 text-sm leading-7 text-white/50">
                TradiQs AI combines market structure, momentum, liquidity, and risk context into a transparent trading workflow. Always validate ideas and manage your own risk.
              </p>
            </details>
          ))}
        </section>

        <footer className="mt-auto w-full border-t border-white/10 bg-[#0A0B0E] px-12 py-16">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2">
              <p className="text-2xl font-bold text-white">
                TradiQs<span className="text-[#00F0FF]"> AI</span>
              </p>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/40">
                Institutional-grade market intelligence, built for traders who refuse to guess.
              </p>
            </div>
            <div>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">
                Explore
              </h3>
              <div className="grid gap-3">
                <Link href="/about" className="text-sm text-white/40 transition-colors hover:text-[#00F0FF]">
                  About
                </Link>
                <Link href="/blog" className="text-sm text-white/40 transition-colors hover:text-[#00F0FF]">
                  Market Insights
                </Link>
                <Link href="/contact" className="text-sm text-white/40 transition-colors hover:text-[#00F0FF]">
                  Contact
                </Link>
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">
                Legal
              </h3>
              <div className="grid gap-3">
                <Link href="/privacy" className="text-sm text-white/40 transition-colors hover:text-[#00F0FF]">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="text-sm text-white/40 transition-colors hover:text-[#00F0FF]">
                  Terms &amp; Conditions
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
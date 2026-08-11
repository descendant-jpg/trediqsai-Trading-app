import Link from 'next/link';
import {
  Activity,
  Apple,
  ArrowRight,
  BellRing,
  BrainCircuit,
  Check,
  Copy,
  GraduationCap,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

const stats = [
  ['50,000+', 'Active Traders'],
  ['85%', 'Avg Win Rate'],
  ['15,000+', 'Signals'],
  ['146+', 'Lessons'],
];

const steps = [
  ['01', 'Choose your market', 'Follow forex, crypto, and equities with setups organized around the sessions you trade.'],
  ['02', 'Review the thesis', 'See the entry, invalidation, targets, and market context behind every AI signal.'],
  ['03', 'Execute with discipline', 'Use risk-aware tools and broker-ready levels to turn a signal into a structured trade.'],
];

const tools = [
  [BellRing, 'Instant Alerts', 'Get clear trade-ready notifications when an institutional setup forms.'],
  [BrainCircuit, 'AI Chart Analysis', 'Translate structure, momentum, and liquidity into an actionable market thesis.'],
  [Radar, 'Volatility Radar', 'Know when conditions expand, compress, or demand a smaller risk profile.'],
  [Copy, 'AutoCopy to MT5', 'Move from insight to execution with levels designed for your trading workflow.'],
  [ShieldCheck, 'Psychology Shield', 'Build a calmer process with guardrails that help prevent emotional decisions.'],
  [GraduationCap, 'Learning Hub', 'Master the setups, vocabulary, and discipline behind better trade decisions.'],
];

const comparisonRows = [
  ['Transparent setup rationale', 'Rarely included', 'Included with every signal'],
  ['Entries, targets & invalidation', 'Often fragmented', 'Unified trade plan'],
  ['Multi-market intelligence', 'Single asset class', 'Forex, crypto & equities'],
  ['Risk-aware trade workflow', 'Manual calculations', 'Built into every idea'],
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    detail: 'For disciplined exploration',
    features: ['Daily market briefing', '3 signals per week', 'Learning Hub preview'],
    cta: 'Start free',
  },
  {
    name: 'Pro',
    price: '$29',
    detail: 'For active traders',
    features: ['Daily AI signals', 'All market coverage', 'Volatility Radar'],
    cta: 'Choose Pro',
  },
  {
    name: 'Elite',
    price: '$79',
    detail: 'For serious execution',
    features: ['Everything in Pro', 'Priority alerts', 'AI Chart Analysis', 'Psychology Shield'],
    cta: 'Choose Elite',
    featured: true,
  },
  {
    name: 'Whale',
    price: '$149',
    detail: 'For full desk access',
    features: ['Everything in Elite', 'AutoCopy to MT5', 'Private market rooms', 'Concierge support'],
    cta: 'Choose Whale',
  },
];

function StoreButton({
  icon: Icon,
  label,
}: {
  icon: typeof Apple;
  label: string;
}) {
  return (
    <button className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/15 bg-black px-4 py-3 text-left transition-colors hover:border-[#00F0FF]">
      <Icon className="h-5 w-5 text-white" />
      <span className="text-xs font-semibold text-white">{label}</span>
    </button>
  );
}

function SignalPhone() {
  return (
    <div className="relative mx-auto flex h-[600px] w-[300px] flex-col overflow-hidden rounded-[3rem] border-[8px] border-[#1A1A1A] bg-[#0A0A0A] shadow-[0_0_50px_rgba(0,240,255,0.1)]">
      <div className="mx-auto mt-3 h-5 w-24 rounded-full bg-[#1A1A1A]" />
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#00F0FF]">Live signal</p>
          <p className="mt-1 text-sm font-bold text-white">Good morning, trader</p>
        </div>
        <div className="rounded-full border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-2 py-1 text-[9px] font-bold text-[#00F0FF]">
          LIVE
        </div>
      </div>
      <div className="mx-4 rounded-2xl border border-[#00F0FF]/30 bg-[#00F0FF]/5 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-white">XAU/USD</p>
            <p className="mt-1 text-[10px] text-white/45">Gold · London Session</p>
          </div>
          <span className="rounded-full bg-[#00F0FF] px-2 py-1 text-[10px] font-extrabold text-black">BUY</span>
        </div>
        <p className="mt-5 font-mono text-2xl font-bold tracking-tight text-white">2,348.60</p>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-[9px]">
          <div><p className="text-white/40">ENTRY</p><p className="mt-1 font-semibold text-white">2345.80</p></div>
          <div><p className="text-white/40">TARGET</p><p className="mt-1 font-semibold text-[#00F0FF]">2362.00</p></div>
          <div><p className="text-white/40">RISK</p><p className="mt-1 font-semibold text-white">0.50%</p></div>
        </div>
      </div>
      <div className="mx-4 mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-white">
          <Activity className="h-3.5 w-3.5 text-[#00F0FF]" /> AI MARKET THESIS
        </div>
        <p className="mt-3 text-[10px] leading-5 text-white/50">
          Liquidity sweep confirmed beneath Asia low. Momentum reclaims the opening range with a clean risk-defined invalidation.
        </p>
      </div>
      <div className="mt-auto border-t border-white/10 bg-[#0C0C0C] px-5 py-4">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-[#00F0FF]">Signals</span>
          <span className="text-white/35">Markets</span>
          <span className="text-white/35">Journal</span>
          <span className="text-white/35">Profile</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="overflow-hidden bg-[#050505]">
      <section className="mx-auto grid min-h-[90vh] max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-32 lg:grid-cols-2">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00F0FF]/20 bg-[#00F0FF]/5 px-3 py-1.5 text-xs font-semibold text-[#00F0FF]">
            <Sparkles className="h-3.5 w-3.5" /> AI market intelligence
          </div>
          <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white md:text-7xl">
            Institutional trading edge, <span className="text-[#00F0FF]">delivered in real time.</span>
          </h1>
          <p className="mb-8 max-w-xl text-lg leading-8 text-gray-400">
            AI-driven entries for forex, crypto, and equities. Backed by institutional chart analysis.
          </p>
          <form id="waitlist" className="mb-8 flex w-full max-w-md" action="#">
            <label className="sr-only" htmlFor="waitlist-email">Email address</label>
            <input
              id="waitlist-email"
              type="email"
              placeholder="Enter your email"
              className="w-full rounded-l-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#00F0FF]"
            />
            <button type="submit" className="cursor-pointer rounded-r-xl bg-[#00F0FF] px-6 py-3 font-bold text-black transition-colors hover:bg-cyan-300">
              Join
            </button>
          </form>
          <div className="flex flex-wrap gap-3">
            <StoreButton icon={Apple} label="Download on the App Store" />
            <StoreButton icon={Play} label="Get it on Google Play" />
          </div>
        </div>
        <div className="flex justify-center py-6 lg:py-0">
          <SignalPhone />
        </div>
      </section>

      <section id="performance" className="border-y border-white/5 bg-[#0A0A0A] py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {stats.map(([value, label]) => (
            <div className="text-center" key={label}>
              <p className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">{value}</p>
              <p className="mt-2 text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-white/5 px-6 pt-10 text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-gray-600">
            USED BY TRADERS ON THE WORLD&apos;S LEADING BROKERS
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-12 gap-y-4 text-lg font-bold tracking-tight text-white/35">
            <span>Exness</span><span>IC Markets</span><span>XM</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#00F0FF]">A simpler process</p>
          <h2 className="text-4xl font-extrabold tracking-tight text-white">Three steps to your first trade.</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map(([number, title, description]) => (
            <article className="rounded-2xl border border-white/5 bg-[#0A0A0A] p-8" key={number}>
              <span className="text-sm font-bold text-[#00F0FF]">{number}</span>
              <h3 className="mt-10 text-xl font-bold text-white">{title}</h3>
              <p className="mt-3 leading-7 text-gray-500">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#00F0FF]">Your trading stack</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-white">Every tool a serious trader actually uses.</h2>
          </div>
          <Link href="/about" className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-[#00F0FF] transition-colors hover:text-white">
            Explore the platform <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {tools.map(([Icon, title, description]) => {
            const ToolIcon = Icon as typeof BellRing;
            return (
              <article className="rounded-2xl border border-white/5 bg-[#0A0A0A] p-8 transition-all hover:border-[#00F0FF]/50" key={title as string}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#00F0FF]/20 bg-[#00F0FF]/10">
                  <ToolIcon className="h-5 w-5 text-[#00F0FF]" />
                </div>
                <h3 className="mt-7 text-lg font-bold text-white">{title as string}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-500">{description as string}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#00F0FF]">The TradiQs difference</p>
          <h2 className="text-4xl font-extrabold tracking-tight text-white">Built for traders, not marketing decks.</h2>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#0A0A0A]">
          <div className="grid grid-cols-3 border-b border-white/5 bg-white/[0.02] px-5 py-4 text-xs font-bold uppercase tracking-wide text-gray-500 md:px-7">
            <span>Capability</span><span>Typical Provider</span><span className="text-[#00F0FF]">TradiQs AI</span>
          </div>
          {comparisonRows.map(([capability, typical, tradiqs]) => (
            <div className="grid grid-cols-3 gap-3 border-b border-white/5 px-5 py-5 text-xs last:border-b-0 md:px-7 md:text-sm" key={capability}>
              <span className="font-medium text-white">{capability}</span>
              <span className="text-gray-500">{typical}</span>
              <span className="font-semibold text-[#00F0FF]">{tradiqs}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#00F0FF]">Plans for every stage</p>
          <h2 className="text-4xl font-extrabold tracking-tight text-white">Choose your edge.</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article className={`flex min-h-[390px] flex-col rounded-2xl border bg-[#0A0A0A] p-8 ${plan.featured ? 'border-[#00F0FF] shadow-[0_0_32px_rgba(0,240,255,0.08)]' : 'border-white/5'}`} key={plan.name}>
              {plan.featured && <span className="mb-5 w-fit rounded-full bg-[#00F0FF] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-black">Most popular</span>}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="mt-2 text-sm text-gray-500">{plan.detail}</p>
              <div className="mt-7 flex items-end gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-white">{plan.price}</span>
                <span className="mb-1 text-sm text-gray-500">/ mo</span>
              </div>
              <ul className="mt-8 grid gap-3">
                {plan.features.map((feature) => (
                  <li className="flex items-start gap-2 text-sm text-gray-400" key={feature}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#00F0FF]" />{feature}
                  </li>
                ))}
              </ul>
              <button className={`mt-auto cursor-pointer rounded-lg px-4 py-3 text-sm font-bold transition-colors ${plan.featured ? 'bg-[#00F0FF] text-black hover:bg-cyan-300' : 'border border-white/10 bg-white/5 text-white hover:border-[#00F0FF] hover:text-[#00F0FF]'}`}>
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 bg-[#0A0A0A]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-6 py-16 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-bold text-white">TradiQs <span className="text-[#00F0FF]">AI</span></p>
            <p className="mt-4 max-w-xs text-sm leading-6 text-gray-500">Institutional-grade market intelligence for traders who refuse to guess.</p>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Platform</p>
            <div className="grid gap-3 text-sm">
              <Link href="/#features" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Features</Link>
              <Link href="/#pricing" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Pricing</Link>
              <Link href="/about" className="cursor-pointer text-gray-500 transition-colors hover:text-white">About</Link>
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Resources</p>
            <div className="grid gap-3 text-sm">
              <Link href="/blog" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Blog</Link>
              <Link href="/contact" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Contact</Link>
              <Link href="/#waitlist" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Waitlist</Link>
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white">Legal</p>
            <div className="grid gap-3 text-sm">
              <Link href="/privacy" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Privacy</Link>
              <Link href="/terms" className="cursor-pointer text-gray-500 transition-colors hover:text-white">Terms</Link>
              <span className="text-gray-500">© 2026 TradiQs AI</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
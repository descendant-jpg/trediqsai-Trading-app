import './globals.css';
import { Inter } from 'next/font/google';
import Link from 'next/link';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'TradiQs AI | Institutional-Grade Trading Signals & AI Bots',
  description:
    'AI-driven trading signals, market intelligence, and disciplined automation for forex, crypto, and equities.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} bg-[#050505] text-white font-sans antialiased selection:bg-[#00F0FF] selection:text-black`}
      >
        <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md">
          <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="cursor-pointer text-lg font-bold tracking-tight text-white">
              TradiQs <span className="text-[#00F0FF]">AI</span>
            </Link>
            <nav className="hidden items-center gap-8 md:flex">
              <Link href="/#features" className="cursor-pointer text-sm text-gray-400 transition-colors hover:text-white">
                Features
              </Link>
              <Link href="/#performance" className="cursor-pointer text-sm text-gray-400 transition-colors hover:text-white">
                Performance
              </Link>
              <Link href="/#pricing" className="cursor-pointer text-sm text-gray-400 transition-colors hover:text-white">
                Pricing
              </Link>
              <Link href="/blog" className="cursor-pointer text-sm text-gray-400 transition-colors hover:text-white">
                Blog
              </Link>
            </nav>
            <Link
              href="/#waitlist"
               className="cursor-pointer rounded-lg bg-[#FFD700] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#ffe147]"
            >
               Get the App
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
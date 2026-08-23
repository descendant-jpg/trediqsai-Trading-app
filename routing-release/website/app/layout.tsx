import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'TradiQs AI | Institutional-Grade Trading Signals & AI Bots',
  description:
    'AI-driven trading signals, market intelligence, and disciplined automation for forex, crypto, and equities.',
};

/**
 * Root layout is chrome-free: public marketing chrome lives in
 * app/(marketing)/layout.tsx and the admin shell in app/admin/(dashboard)/layout.tsx,
 * so `/admin/*` never renders the public Navbar or MarketTicker.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} bg-[#050505] text-white font-sans antialiased selection:bg-[#00F0FF] selection:text-black`}
      >
        {children}
      </body>
    </html>
  );
}

import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'TradiQs AI — The Institutional Edge in Your Pocket',
  description: 'AI-powered trading intelligence for the next generation of traders.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0A0B0E] text-white antialiased flex`}>
        {children}
      </body>
    </html>
  );
}
import './globals.css';
import { Navbar, Footer } from './components/site';

export const metadata = { title: 'TradiQs AI — The Institutional Edge in Your Pocket', description: 'AI-powered trading intelligence for the next generation of traders.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><Navbar />{children}<Footer /></>;
}
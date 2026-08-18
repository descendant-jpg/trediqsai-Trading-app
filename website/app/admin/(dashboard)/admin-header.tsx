'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ExternalLink, ShieldCheck } from 'lucide-react';

const SECTION_LABELS: Record<string, string> = {
  blog: 'Market Insights',
  categories: 'Categories & Tags',
  waitlist: 'Waitlist Leads',
  inbox: 'Help Desk',
  comments: 'Comments Moderation',
  settings: 'System Settings',
  signals: 'Signals',
  users: 'Users',
};

function labelFor(segment: string) {
  return (
    SECTION_LABELS[segment] ??
    segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/**
 * Institutional admin top bar: brand + CMS badge, live breadcrumbs derived from
 * the current pathname, a link back to the public site, and the signed-in
 * admin indicator.
 */
export function AdminHeader() {
  const pathname = usePathname() ?? '/admin';
  const segments = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-800 bg-[#0D0D0D]/95 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm font-bold tracking-tight text-white">
            TradiQs <span className="text-[#00FFFF]">AI</span>
          </Link>
          <span className="rounded-md border border-[#00FFFF]/40 bg-[#00FFFF]/10 px-2 py-1 text-[10px] font-black tracking-widest text-[#00FFFF]">
            [ CMS COMMAND CENTER ]
          </span>
        </div>

        <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-gray-500 md:flex">
          <Link href="/admin" className="hover:text-white">
            Dashboard
          </Link>
          {segments.map((segment, index) => {
            const href = `/admin/${segments.slice(0, index + 1).join('/')}`;
            const last = index === segments.length - 1;
            return (
              <span className="flex items-center gap-1" key={href}>
                <ChevronRight className="h-3 w-3 text-gray-700" />
                {last ? (
                  <span aria-current="page" className="font-semibold text-white">
                    {labelFor(segment)}
                  </span>
                ) : (
                  <Link href={href} className="hover:text-white">
                    {labelFor(segment)}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-[#00FFFF]"
          >
            View Live Site <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <span className="hidden items-center gap-1.5 rounded-lg border border-gray-800 bg-[#111111] px-3 py-1.5 text-xs text-gray-400 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-[#00FFFF]" /> nextgensynthex@gmail.com
          </span>
        </div>
      </div>
    </header>
  );
}

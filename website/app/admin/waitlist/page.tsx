import { Mail, UserPlus } from 'lucide-react';
import { getSupabaseServer } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

type WaitlistSignup = {
  id: number;
  email: string;
  created_at: string;
};

function formatSignupDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default async function WaitlistPage() {
  let signups: WaitlistSignup[] = [];
  let unavailable = false;

  try {
    const supabase = getSupabaseServer();
    if (!supabase) {
      unavailable = true;
    } else {
      const { data, error } = await supabase
        .from('waitlist')
        .select('id, email, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        unavailable = true;
      } else {
        signups = (data ?? []) as WaitlistSignup[];
      }
    }
  } catch {
    unavailable = true;
  }

  return (
    <div className="p-5 md:p-8 lg:p-10">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.25em] text-cyan">Launch leads</p>
          <h1 className="mt-3 text-3xl font-black">Waitlist signups</h1>
          <p className="mt-2 text-sm text-muted">Newest subscribers appear first.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-cyan/20 bg-cyan/5 px-5 py-4">
          <UserPlus className="h-5 w-5 text-cyan" />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Total signups</p>
            <p className="text-2xl font-bold">{signups.length.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {unavailable ? (
        <div className="rounded-2xl border border-white/10 bg-card p-8 text-sm text-muted">
          Waitlist entries are unavailable right now. Confirm the server-side Supabase configuration and the waitlist migration before trying again.
        </div>
      ) : signups.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-card p-10 text-center">
          <Mail className="mx-auto h-9 w-9 text-cyan" />
          <h2 className="mt-5 text-lg font-bold">No waitlist signups yet</h2>
          <p className="mt-2 text-sm text-muted">New leads from the public waitlist form will appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-b border-white/10 px-5 py-4 text-xs font-bold uppercase tracking-wider text-muted md:px-6">
            <span>Email</span>
            <span>Signed up</span>
          </div>
          <div className="divide-y divide-white/10">
            {signups.map((signup) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 px-5 py-5 md:px-6" key={signup.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan">
                    <Mail className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm font-medium">{signup.email}</span>
                </div>
                <time className="self-center text-right text-xs text-muted" dateTime={signup.created_at}>
                  {formatSignupDate(signup.created_at)}
                </time>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
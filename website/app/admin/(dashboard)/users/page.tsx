'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '../../../../lib/supabase';

type User = { id: string; username?: string; email?: string; tier?: string };

const TIERS = ['free', 'pro', 'elite', 'whale', 'vip'] as const;

export default function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState('Loading users…');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, email, tier')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUsers(data ?? []);
        setStatus('');
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'Unable to load users.');
      }
    })();
  }, []);

  /**
   * `profiles.tier` is server-owned — the browser holds no UPDATE privilege on
   * it, which is what stops users self-granting paid access. Operator changes
   * therefore go through the admin API route, which performs the write with
   * the service role behind the admin session cookie.
   */
  async function updateTier(id: string, tier: string) {
    const previous = users;
    setSavingId(id);
    setStatus('');
    // Optimistic: revert below if the server rejects the change.
    setUsers(users.map(u => (u.id === id ? { ...u, tier } : u)));
    try {
      const res = await fetch('/api/admin/users/tier', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: id, tier }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Unable to update tier.');
      }
    } catch (e) {
      setUsers(previous);
      setStatus(e instanceof Error ? e.message : 'Unable to update tier.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-5 md:p-8 lg:p-10">
      <p className="text-xs font-bold uppercase tracking-[.25em] text-cyan">Account operations</p>
      <h1 className="mt-3 text-3xl font-black">Users</h1>
      {status && <p className="mt-6 text-sm text-muted">{status}</p>}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-card">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="p-5">User</th>
              <th>Email</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr className="border-b border-white/10 last:border-0" key={user.id}>
                <td className="p-5 font-semibold">{user.username ?? 'Trader'}</td>
                <td className="text-muted">{user.email ?? '—'}</td>
                <td>
                  <select
                    value={user.tier ?? 'free'}
                    disabled={savingId === user.id}
                    onChange={e => updateTier(user.id, e.target.value)}
                    className="rounded-lg border border-white/10 bg-ink p-2 text-xs disabled:opacity-50"
                  >
                    {TIERS.map(t => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

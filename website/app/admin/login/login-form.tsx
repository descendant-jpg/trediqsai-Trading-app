'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Lock, Mail } from 'lucide-react';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Unable to sign in. Please try again.');
        setPending(false);
        return;
      }

      const target = next && next.startsWith('/admin') ? next : '/admin';
      router.replace(target);
      router.refresh();
    } catch {
      setError('Unable to sign in. Please try again.');
      setPending(false);
    }
  }

  return (
    <form className="mt-7 grid gap-3" onSubmit={onSubmit}>
      <label className="text-xs font-bold uppercase tracking-wider text-muted" htmlFor="admin-email">
        Administrator email
      </label>
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink px-4 py-3">
        <Mail className="h-4 w-4 shrink-0 text-cyan" />
        <input
          autoComplete="username"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          id="admin-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@company.com"
          required
          type="email"
          value={email}
        />
      </div>
      <label className="text-xs font-bold uppercase tracking-wider text-muted" htmlFor="admin-password">
        Password
      </label>
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink px-4 py-3">
        <Lock className="h-4 w-4 shrink-0 text-cyan" />
        <input
          autoComplete="current-password"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          id="admin-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
          type="password"
          value={password}
        />
      </div>
      <button
        className="mt-2 rounded-xl bg-cyan px-4 py-3 text-sm font-bold text-ink transition hover:bg-white disabled:opacity-60"
        disabled={pending || password.length === 0 || email.length === 0}
        type="submit"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {error ? (
        <p aria-live="polite" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}

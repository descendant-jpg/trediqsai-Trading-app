'use client';

import { FormEvent, useState } from 'react';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function WaitlistForm() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [email, setEmail] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === 'loading') return;

    const trimmed = email.trim();
    if (!trimmed) {
      setState({ kind: 'error', message: 'Please enter your email address.' });
      return;
    }

    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: 'error', message: data.error ?? 'Something went wrong. Please try again.' });
      } else {
        setState({ kind: 'success' });
        setEmail('');
      }
    } catch {
      setState({ kind: 'error', message: 'Network error. Please try again.' });
    }
  }

  if (state.kind === 'success') {
    return (
      <div className="mb-8 flex w-full max-w-md items-center gap-3 rounded-xl border border-[#00F0FF]/40 bg-[#00F0FF]/5 px-5 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00F0FF] text-black">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-white">You&apos;re on the list!</p>
          <p className="text-xs text-gray-400">We&apos;ll let you know the moment TradiQs AI launches.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 w-full max-w-md">
      <form id="waitlist" onSubmit={handleSubmit} noValidate className="flex w-full">
        <label className="sr-only" htmlFor="waitlist-email">Email address</label>
        <input
          id="waitlist-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state.kind === 'error') setState({ kind: 'idle' });
          }}
          placeholder="Enter your email"
          disabled={state.kind === 'loading'}
          aria-describedby={state.kind === 'error' ? 'waitlist-error' : undefined}
          aria-invalid={state.kind === 'error' ? 'true' : undefined}
          className={`w-full rounded-l-xl border bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#00F0FF] disabled:opacity-60 ${state.kind === 'error' ? 'border-red-500/70' : 'border-white/10'}`}
        />
        <button
          type="submit"
          disabled={state.kind === 'loading'}
          className="cursor-pointer rounded-r-xl bg-[#00F0FF] px-6 py-3 font-bold text-black transition-colors hover:bg-cyan-300 disabled:opacity-60"
        >
          {state.kind === 'loading' ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Joining
            </span>
          ) : 'Join'}
        </button>
      </form>
      {state.kind === 'error' && (
        <p id="waitlist-error" role="alert" className="mt-2 text-xs text-red-400">
          {state.message}
        </p>
      )}
    </div>
  );
}

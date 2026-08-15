'use client';

import { FormEvent, useId, useState } from 'react';

export default function WaitlistForm() {
  const formId = useId();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const name = fullName.trim();
    const address = email.trim();
    if (!name || !address) {
      setError('Please enter your full name and email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: address }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setIsSubmitted(true);
      setFullName('');
      setEmail('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="w-full rounded-lg border border-[#00FFFF]/30 bg-[#00FFFF]/5 px-4 py-3 text-sm font-semibold text-[#00FFFF]">
        ✓ You&apos;re on the list! We&apos;ll notify you when TradiQs AI goes live.
      </div>
    );
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 md:flex-row">
        <label className="sr-only" htmlFor={`${formId}-name`}>Full name</label>
        <input
          id={`${formId}-name`}
          type="text"
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value);
            if (error) setError('');
          }}
          placeholder="Full Name"
          autoComplete="name"
          disabled={isSubmitting}
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-transparent px-4 py-3 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-[#00FFFF] disabled:opacity-60"
        />
        <label className="sr-only" htmlFor={`${formId}-email`}>Email address</label>
        <input
          id={`${formId}-email`}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError('');
          }}
          placeholder="Email Address"
          autoComplete="email"
          disabled={isSubmitting}
          aria-describedby={error ? `${formId}-error` : undefined}
          aria-invalid={error ? 'true' : undefined}
          className={`min-w-0 flex-1 rounded-lg border bg-transparent px-4 py-3 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-[#00FFFF] disabled:opacity-60 ${error ? 'border-red-500/70' : 'border-gray-700'}`}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="cursor-pointer whitespace-nowrap rounded-lg bg-[#FFD700] px-6 py-3 font-bold text-black transition hover:bg-yellow-400 disabled:opacity-60"
        >
          {isSubmitting ? 'Joining...' : 'Join Waitlist'}
        </button>
      </form>
      {error && (
        <p id={`${formId}-error`} role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.replace('/admin/login');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted hover:bg-white/5 hover:text-white disabled:opacity-60"
      disabled={pending}
      onClick={signOut}
      type="button"
    >
      <LogOut className="h-4 w-4" />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

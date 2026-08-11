'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, LogOut, ShieldOff } from 'lucide-react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState<'logout' | 'revoke' | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function signOut() {
    setPending('logout');
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.replace('/admin/login');
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function revokeAll() {
    setPending('revoke');
    setShowConfirm(false);
    setRevokeError(null);
    try {
      const res = await fetch('/api/admin/revoke-all', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRevokeError(
          (body as { error?: string }).error ??
            `Revocation failed (HTTP ${res.status}). No sessions were ended.`,
        );
        return;
      }
      // Confirmed success — navigate to login.
      router.replace('/admin/login');
      router.refresh();
    } catch {
      setRevokeError('Could not reach the server. No sessions were ended. Try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted hover:bg-white/5 hover:text-white disabled:opacity-60"
        disabled={pending !== null}
        onClick={signOut}
        type="button"
      >
        <LogOut className="h-4 w-4" />
        {pending === 'logout' ? 'Signing out…' : 'Sign out'}
      </button>

      {revokeError && (
        <div className="mt-1 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{revokeError}</span>
        </div>
      )}

      {showConfirm ? (
        <div className="mt-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <p className="font-semibold">Sign out all devices?</p>
          <p className="mt-1 text-red-400/80">
            Every active admin session — including this one — will be ended immediately.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-60"
              disabled={pending !== null}
              onClick={revokeAll}
              type="button"
            >
              {pending === 'revoke' ? 'Revoking…' : 'Yes, sign out all'}
            </button>
            <button
              className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-muted hover:text-white disabled:opacity-60"
              disabled={pending !== null}
              onClick={() => setShowConfirm(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted hover:bg-white/5 hover:text-red-400 disabled:opacity-60"
          disabled={pending !== null}
          onClick={() => { setRevokeError(null); setShowConfirm(true); }}
          type="button"
        >
          <ShieldOff className="h-4 w-4" />
          Sign out all devices
        </button>
      )}
    </>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

/** Show the banner when this many ms remain in the session. */
const WARN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/** How often to poll the session endpoint (ms). */
const POLL_INTERVAL_MS = 60 * 1000; // every minute

function formatMinutes(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60_000));
  return mins === 1 ? '1 minute' : `${mins} minutes`;
}

export function SessionWarningBanner() {
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extended, setExtended] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchExpiry = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const remaining = (data.expiresAt as number) - Date.now();
      setMsRemaining(remaining);
      // Reset dismissed state when the session is healthy (>15 min left)
      if (remaining > WARN_THRESHOLD_MS) {
        setDismissed(false);
        setExtended(false);
      }
    } catch {
      // Network error — do nothing, the middleware will handle expiry
    }
  }, []);

  useEffect(() => {
    fetchExpiry();
    intervalRef.current = setInterval(fetchExpiry, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchExpiry]);

  async function handleExtend() {
    setExtending(true);
    try {
      const res = await fetch('/api/admin/refresh', { method: 'POST' });
      if (res.ok) {
        setExtended(true);
        setDismissed(false);
        // Re-fetch expiry so the countdown updates immediately
        await fetchExpiry();
      }
    } finally {
      setExtending(false);
    }
  }

  // Only show when within the warning window and not dismissed/extended
  const shouldShow =
    msRemaining !== null &&
    msRemaining > 0 &&
    msRemaining <= WARN_THRESHOLD_MS &&
    !dismissed &&
    !extended;

  if (!shouldShow) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/90 p-4 shadow-xl backdrop-blur"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-amber-300">Session expiring soon</p>
        <p className="mt-0.5 text-amber-200/80">
          Your admin session expires in{' '}
          <span className="font-bold">{formatMinutes(msRemaining)}</span>. Stay
          signed in to avoid losing unsaved work.
        </p>
        <button
          onClick={handleExtend}
          disabled={extending}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-60"
          type="button"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${extending ? 'animate-spin' : ''}`} aria-hidden />
          {extending ? 'Extending…' : 'Stay signed in'}
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss session warning"
        className="rounded-lg p-1 text-amber-400/60 transition hover:bg-amber-500/20 hover:text-amber-300"
        type="button"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

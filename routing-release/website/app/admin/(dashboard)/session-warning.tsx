'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

/** Show the "expiring soon" banner when this many ms remain in the session. */
const WARN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Show the "cannot be extended" banner this far ahead of the hard deadline.
 * Longer than the normal warning: signing in again is more disruptive than
 * clicking "Stay signed in", so admins get more notice to finish up.
 */
const FINAL_WARN_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** How often to poll the session endpoint (ms). */
const POLL_INTERVAL_MS = 60 * 1000; // every minute

/** BroadcastChannel name for cross-tab session sync. */
const CHANNEL_NAME = 'admin-session-sync';

type SessionState = {
  expiresAt: number;
  /** Hard deadline for this sign-in; extending can never go past it. */
  absoluteExpiresAt: number;
  /** False once the session has been extended as far as it can go. */
  canExtend: boolean;
};

type SyncMessage =
  | ({ type: 'extended' } & SessionState)
  | { type: 'dismissed' };

function formatDuration(ms: number): string {
  const totalMins = Math.max(0, Math.ceil(ms / 60_000));
  if (totalMins < 60) return totalMins === 1 ? '1 minute' : `${totalMins} minutes`;

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
  if (mins === 0) return hourPart;
  return `${hourPart} ${mins} min`;
}

/** Create a BroadcastChannel if the API is available, otherwise return null. */
function openChannel(): BroadcastChannel | null {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    return new BroadcastChannel(CHANNEL_NAME);
  }
  return null;
}

export function SessionWarningBanner() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extended, setExtended] = useState(false);
  const [extendError, setExtendError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const applySession = useCallback((next: SessionState) => {
    setSession(next);
    setNow(Date.now());
    // Reset the dismissed/extended state once the session is healthy again, so
    // the banner can come back for the next window.
    if (next.canExtend && next.expiresAt - Date.now() > WARN_THRESHOLD_MS) {
      setDismissed(false);
      setExtended(false);
      setExtendError('');
    }
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      applySession({
        expiresAt: data.expiresAt as number,
        absoluteExpiresAt: data.absoluteExpiresAt as number,
        canExtend: Boolean(data.canExtend),
      });
    } catch {
      // Network error — do nothing, the middleware will handle expiry
    }
  }, [applySession]);

  // Set up BroadcastChannel listener and polling interval.
  useEffect(() => {
    fetchSession();
    intervalRef.current = setInterval(fetchSession, POLL_INTERVAL_MS);

    // Open cross-tab channel (may be null in unsupported environments).
    const channel = openChannel();
    channelRef.current = channel;

    if (channel) {
      channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        const msg = event.data;
        if (msg.type === 'extended') {
          applySession({
            expiresAt: msg.expiresAt,
            absoluteExpiresAt: msg.absoluteExpiresAt,
            canExtend: msg.canExtend,
          });
          setExtended(msg.canExtend);
          setDismissed(false);
        } else if (msg.type === 'dismissed') {
          setDismissed(true);
        }
      };
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (channel) channel.close();
    };
  }, [fetchSession, applySession]);

  async function handleExtend() {
    setExtending(true);
    setExtendError('');
    try {
      const res = await fetch('/api/admin/refresh', { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The session has hit its maximum length (or ended) — signing in again
        // is the only way forward, so say so instead of failing silently.
        setExtendError(
          typeof body?.error === 'string'
            ? body.error
            : 'Could not extend the session. Please sign in again.',
        );
        // Refresh our view of the session so the banner switches to the
        // "cannot be extended" state rather than still offering the button.
        await fetchSession();
        return;
      }

      const next: SessionState = {
        expiresAt: body.expiresAt as number,
        absoluteExpiresAt: body.absoluteExpiresAt as number,
        canExtend: (body.expiresAt as number) < (body.absoluteExpiresAt as number),
      };
      applySession(next);
      // Only hide the banner if there is still room to extend later; if this
      // was the last possible extension, keep warning about the hard deadline.
      setExtended(next.canExtend);
      setDismissed(false);

      // Notify other tabs that the session was extended.
      channelRef.current?.postMessage({
        type: 'extended',
        ...next,
      } satisfies SyncMessage);
    } finally {
      setExtending(false);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    // Notify other tabs to dismiss their banner too.
    channelRef.current?.postMessage({ type: 'dismissed' } satisfies SyncMessage);
  }

  // Keep the countdown moving between polls.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  if (!session || now === null || dismissed) return null;

  const msRemaining = session.expiresAt - now;
  const msUntilFinal = session.absoluteExpiresAt - now;
  if (msRemaining <= 0) return null;

  // Two distinct states:
  //  - final:  the session can no longer be extended; only signing in helps.
  //  - normal: still extendable, offer "Stay signed in".
  const isFinal = !session.canExtend || Boolean(extendError);
  const withinFinalWindow = msUntilFinal <= FINAL_WARN_THRESHOLD_MS;
  const withinWarnWindow = msRemaining <= WARN_THRESHOLD_MS;

  const shouldShow = isFinal
    ? withinFinalWindow || Boolean(extendError)
    : withinWarnWindow && !extended;

  if (!shouldShow) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/90 p-4 shadow-xl backdrop-blur"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" aria-hidden />
      <div className="flex-1 text-sm">
        {isFinal ? (
          <>
            <p className="font-semibold text-amber-300">
              Sign-in window ending — cannot be extended
            </p>
            <p className="mt-0.5 text-amber-200/80">
              This sign-in has reached its maximum length. You will be signed out
              in{' '}
              <span className="font-bold">
                {formatDuration(Math.min(msRemaining, msUntilFinal))}
              </span>
              . Finish or save your work, then sign in again to keep going.
            </p>
            {extendError ? (
              <p className="mt-2 text-amber-100">{extendError}</p>
            ) : null}
            <a
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-400"
              href="/admin/login"
            >
              Sign in again
            </a>
          </>
        ) : (
          <>
            <p className="font-semibold text-amber-300">Session expiring soon</p>
            <p className="mt-0.5 text-amber-200/80">
              Your admin session expires in{' '}
              <span className="font-bold">{formatDuration(msRemaining)}</span>. Stay
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
          </>
        )}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss session warning"
        className="rounded-lg p-1 text-amber-400/60 transition hover:bg-amber-500/20 hover:text-amber-300"
        type="button"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

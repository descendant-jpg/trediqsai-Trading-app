/**
 * Combine an absolute cycle deadline with a per-call timeout: whichever
 * fires first aborts the request. Used by the signal publisher so no single
 * network call — quote, Supabase read/write, Anthropic, or push fan-out —
 * can make a cycle outlive its distributed lease window.
 *
 * Timers are unref'd so they never hold the process (or a test runner) open.
 */
function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  (timer as { unref?: () => void }).unref?.();
  return controller.signal;
}

/** Absolute deadline for one publisher cycle. */
export function cycleDeadline(timeoutMs: number): AbortSignal {
  return timeoutSignal(timeoutMs);
}

export function withDeadline(deadline: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const perCall = timeoutSignal(timeoutMs);
  return deadline ? AbortSignal.any([deadline, perCall]) : perCall;
}

/**
 * Pure username-resolution logic for the auth flow, extracted from
 * AuthContext so it can be unit-tested without React or Supabase.
 *
 * Invariants this logic guarantees (each fixed a real "Choose a Username"
 * prompt flash in the past — see the unit tests):
 * 1. A username staged by an in-flight email sign-up wins immediately.
 * 2. A locally recorded successful claim wins over a missing/stale profile row.
 * 3. A remote username syncs back to local storage.
 * 4. A profile lookup error never downgrades a known username.
 */

/** `undefined` = not determined; `null` = confirmed no username (prompt). */
export type UsernameState = string | null | undefined;

export interface UsernameResolutionDeps {
  /**
   * Returns (and consumes) the username staged by an in-flight email
   * sign-up, or null when none is staged.
   */
  consumePendingSignupUsername: () => string | null;
  /** Read the locally recorded claimed username for this user. */
  getStoredUsername: () => Promise<string | null>;
  /** Persist the claimed username locally. Errors must be swallowed by impl. */
  storeUsername: (name: string) => void;
  /**
   * Fetch the profile row's username.
   * Resolves to `{ username }` on success or `{ error }` on lookup failure.
   */
  fetchRemoteUsername: () => Promise<
    { username: string | null; error?: undefined } | { username?: undefined; error: string }
  >;
  /** Functional state setter (mirrors React's setState). */
  setUsername: (update: UsernameState | ((prev: UsernameState) => UsernameState)) => void;
  /** True once the effect has been cleaned up; stop applying updates. */
  isCancelled: () => boolean;
  /** Non-fatal warning sink. */
  warn: (message: string) => void;
}

/**
 * Resolve the signed-in user's username, applying local sources first so the
 * "Choose a Username" prompt can never flash for a user who already has one.
 */
export async function resolveUsername(deps: UsernameResolutionDeps): Promise<void> {
  // A locally recorded successful claim wins immediately — never re-show
  // the prompt for this user, even if the profile fetch below is slow,
  // fails, or returns a stale (pre-claim) row.
  let locallyClaimed: string | null = null;

  // A username staged by an in-flight email sign-up wins immediately —
  // the signup metadata guarantees the trigger will store this exact
  // value, so never show the prompt while the profile row commits.
  const staged = deps.consumePendingSignupUsername();
  if (staged) {
    locallyClaimed = staged;
    deps.setUsername(staged);
    deps.storeUsername(staged);
  }

  try {
    locallyClaimed = (await deps.getStoredUsername()) ?? locallyClaimed;
  } catch {
    // Storage unavailable — fall through to the server lookup.
  }
  if (deps.isCancelled()) return;
  if (locallyClaimed) {
    deps.setUsername(locallyClaimed);
  }

  const result = await deps.fetchRemoteUsername();
  if (deps.isCancelled()) return;
  // On lookup failure, don't block the app behind the prompt.
  if (result.error !== undefined) {
    deps.warn(`Failed to load profile username: ${result.error}`);
    if (!locallyClaimed) deps.setUsername(undefined);
    return;
  }
  const remote = result.username ?? null;
  if (remote) {
    deps.setUsername(remote);
    // Keep the local record in sync (covers usernames set at signup too).
    deps.storeUsername(remote);
  } else if (!locallyClaimed) {
    // Never downgrade a username we already know about to null — only an
    // unclaimed profile with no local record should trigger the prompt.
    deps.setUsername((prev) => (typeof prev === 'string' ? prev : null));
  }
}

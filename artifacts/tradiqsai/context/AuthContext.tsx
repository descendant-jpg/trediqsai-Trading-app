import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';
import { resolveUsername } from '@/lib/usernameResolution';

/**
 * Local record of a successfully claimed username, keyed per user id.
 * The claim_username RPC is one-shot, so once it succeeds we can trust this
 * record even if a subsequent profile fetch races or returns a stale row
 * (e.g. read replica lag right after the claim). Prevents the "Choose a
 * Username" screen from ever reappearing after a successful claim.
 */
const claimedUsernameKey = (userId: string) => `tradiqs:claimed-username:${userId}`;

/**
 * Username chosen during an email/password sign-up, staged BEFORE the
 * signUp call so it is already available when the new session arrives.
 * The handle_new_user trigger copies this same value into the profile row
 * server-side, but that insert can commit after our first profile lookup —
 * without this, `maybeSingle()` returns no row and the "Choose a Username"
 * prompt flashes for a user who already picked one.
 */
let pendingSignupUsername: string | null = null;

/** Stage (or clear) the username for an in-flight email sign-up. */
export function setPendingSignupUsername(name: string | null) {
  pendingSignupUsername = name ? name.trim() || null : null;
}

interface AuthContextValue {
  /** Current Supabase session, or null when signed out. */
  session: Session | null;
  /** True while the initial session is being restored from storage. */
  loading: boolean;
  /** Whether Supabase env vars are configured at all. */
  configured: boolean;
  /**
   * True when the signed-in user's profile has no username yet (e.g. a
   * Google/Apple sign-up) and they haven't skipped the prompt this session.
   */
  needsUsername: boolean;
  /** Called by the username prompt after a successful claim. */
  setUsernameClaimed: (username: string) => void;
  /** Dismiss the username prompt for this session only (re-prompts on relaunch). */
  skipUsernamePrompt: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tracks the Supabase auth session for the whole app. When Supabase isn't
 * configured (missing EXPO_PUBLIC_ env vars) it reports signed-out without
 * touching the client, so the app never crashes on import.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  // undefined = not checked yet; null = profile has no username.
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [skippedPrompt, setSkippedPrompt] = useState(false);

  // Whenever the signed-in user changes, look up their profile username so
  // social sign-ups (no username in metadata) can be prompted to pick one.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setUsername(undefined);
      setSkippedPrompt(false);
      return;
    }
    let cancelled = false;
    // The resolution rules (staged signup username wins, local claim record
    // beats a missing row, remote syncs to local, errors never downgrade)
    // live in lib/usernameResolution.ts so they stay unit-tested.
    resolveUsername({
      consumePendingSignupUsername: () => {
        const staged = pendingSignupUsername;
        pendingSignupUsername = null;
        return staged;
      },
      getStoredUsername: () => AsyncStorage.getItem(claimedUsernameKey(userId)),
      storeUsername: (name) => {
        AsyncStorage.setItem(claimedUsernameKey(userId), name).catch(() => {});
      },
      fetchRemoteUsername: async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', userId)
          .maybeSingle();
        if (error) return { error: error.message };
        return { username: data?.username ?? null };
      },
      setUsername,
      isCancelled: () => cancelled,
      warn: (message) => console.warn(message),
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setUsernameClaimed = useCallback(
    (name: string) => {
      setUsername(name);
      // Persist the successful claim so the prompt can never reappear for
      // this user, even if the next profile fetch hasn't caught up yet.
      if (userId) {
        AsyncStorage.setItem(claimedUsernameKey(userId), name).catch(() => {});
      }
    },
    [userId],
  );

  const skipUsernamePrompt = useCallback(() => {
    setSkippedPrompt(true);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      configured: isSupabaseConfigured,
      needsUsername: !!session && username === null && !skippedPrompt,
      setUsernameClaimed,
      skipUsernamePrompt,
      signOut: async () => {
        if (!isSupabaseConfigured) return;
        await supabase.auth.signOut();
      },
    }),
    [session, loading, username, skippedPrompt, setUsernameClaimed, skipUsernamePrompt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

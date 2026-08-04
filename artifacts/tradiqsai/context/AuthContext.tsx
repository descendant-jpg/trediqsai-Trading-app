import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';

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
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // On lookup failure, don't block the app behind the prompt.
        if (error) {
          console.warn('Failed to load profile username:', error.message);
          setUsername(undefined);
          return;
        }
        setUsername(data?.username ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setUsernameClaimed = useCallback((name: string) => {
    setUsername(name);
  }, []);

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

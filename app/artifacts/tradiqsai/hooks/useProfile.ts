import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';

export interface Profile {
  id: string;
  balance: number;
  daily_starting_balance: number;
  account_status: 'ACTIVE' | 'BLOWN';
}

/** Poll interval fallback in case realtime isn't enabled on `profiles`. */
const POLL_MS = 15_000;

/**
 * Unique suffix for every realtime channel instance. `supabase.removeChannel`
 * resolves asynchronously, so on a fast unmount/remount the previous channel
 * can still be subscribed under the same topic — reusing the topic then throws
 * "cannot add 'postgres_changes' callbacks ... after 'subscribe()'".
 */
let profileChannelSeq = 0;

/**
 * Loads the signed-in trader's server-owned profile (balance,
 * daily starting balance, account status) and keeps it fresh:
 * - Subscribes to Supabase realtime UPDATEs on the profile row, so a
 *   liquidation by the drawdown monitor appears without an app restart.
 * - Polls every 15s as a fallback when realtime isn't available.
 *
 * Returns `profile: null` while loading, when signed out, or when
 * Supabase isn't configured — callers fall back to the local simulation.
 */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) {
      if (mounted.current) setProfile(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, balance, daily_starting_balance, account_status')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;

      if (mounted.current && data) {
        setProfile({
          id: data.id,
          balance: Number(data.balance),
          daily_starting_balance: Number(data.daily_starting_balance),
          account_status: data.account_status === 'BLOWN' ? 'BLOWN' : 'ACTIVE',
        });
      }
    } catch (error) {
      console.warn('Profile refresh failed; using simulated account state.', error);
      if (mounted.current) setProfile(null);
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    if (!userId || !isSupabaseConfigured) {
      setProfile(null);
      return () => {
        mounted.current = false;
      };
    }

    refresh();

    const channel = supabase
      .channel(`profile-${userId}-${++profileChannelSeq}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!mounted.current || !row) return;
          setProfile({
            id: String(row.id),
            balance: Number(row.balance),
            daily_starting_balance: Number(row.daily_starting_balance),
            account_status: row.account_status === 'BLOWN' ? 'BLOWN' : 'ACTIVE',
          });
        },
      )
      .subscribe();

    const poll = setInterval(refresh, POLL_MS);

    return () => {
      mounted.current = false;
      clearInterval(poll);
      try {
        channel.unsubscribe();
        supabase.removeChannel(channel).catch((error) => {
          console.warn('Failed to remove profile realtime channel.', error);
        });
      } catch (error) {
        console.warn('Failed to tear down profile realtime channel.', error);
      }
    };
  }, [userId, refresh]);

  return { profile, refresh };
}

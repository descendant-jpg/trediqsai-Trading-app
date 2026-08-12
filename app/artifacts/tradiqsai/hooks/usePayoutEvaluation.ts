import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { parsePayoutEvaluation, type PayoutEvaluation } from '@/lib/payoutEvaluation';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';

const POLL_MS = 15_000;

/**
 * Reads the server-authoritative evaluation result. No local balance, tier, or
 * trade-history fallback is permitted: unavailable data means payout locked.
 */
export function usePayoutEvaluation() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [evaluation, setEvaluation] = useState<PayoutEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) {
      if (mounted.current) {
        setEvaluation(null);
        setError(!userId ? 'Sign in to unlock payout evaluation.' : 'Payout evaluation is not configured.');
        setLoading(false);
      }
      return;
    }

    if (mounted.current) setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('payout_evaluation_summary');
      if (rpcError) throw rpcError;
      const parsed = parsePayoutEvaluation(data);
      if (!parsed) throw new Error('Payout evaluation data is incomplete.');
      if (mounted.current) {
        setEvaluation(parsed);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) {
        setEvaluation(null);
        setError(err instanceof Error ? err.message : 'Payout evaluation is unavailable.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(poll);
    };
  }, [refresh]);

  const requestPayout = useCallback(async (): Promise<PayoutEvaluation> => {
    if (!userId || !isSupabaseConfigured) throw new Error('Payout evaluation is unavailable.');
    const { data, error: rpcError } = await supabase.rpc('request_evaluation_payout');
    if (rpcError) throw rpcError;
    const parsed = parsePayoutEvaluation(data);
    if (!parsed) throw new Error('Payout request returned incomplete data.');
    if (mounted.current) {
      setEvaluation(parsed);
      setError(null);
    }
    return parsed;
  }, [userId]);

  return { evaluation, loading, error, refresh, requestPayout };
}
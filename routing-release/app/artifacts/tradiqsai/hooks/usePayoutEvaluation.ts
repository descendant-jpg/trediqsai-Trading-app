import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  parsePayoutEvaluation,
  parsePayoutRequests,
  type PayoutEvaluation,
  type PayoutRequest,
} from '@/lib/payoutEvaluation';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';
import { canAccessPayoutEvaluation } from '@/lib/payoutAccess';

const POLL_MS = 15_000;

/**
 * Reads the server-authoritative evaluation result. No local balance, tier, or
 * trade-history fallback is permitted: unavailable data means payout locked.
 */
export function usePayoutEvaluation() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const isGuest = session?.user?.is_anonymous === true;
  const payoutAccessAllowed = canAccessPayoutEvaluation(session);
  const [evaluation, setEvaluation] = useState<PayoutEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PayoutRequest[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const mounted = useRef(true);
  const accessScope = `${userId ?? 'signed-out'}:${payoutAccessAllowed ? 'account' : 'locked'}`;
  const activeAccessScope = useRef(accessScope);
  const accessGeneration = useRef(0);

  // Invalidate stale account requests during render, before a guest screen can
  // consume their completion. Effect cleanup alone is insufficient because a
  // new effect can set a shared mounted flag back to true before the old RPC
  // settles.
  if (activeAccessScope.current !== accessScope) {
    activeAccessScope.current = accessScope;
    accessGeneration.current += 1;
  }

  const refreshEvaluation = useCallback(async () => {
    const generation = accessGeneration.current;
    const isCurrent = () =>
      mounted.current &&
      generation === accessGeneration.current &&
      activeAccessScope.current === accessScope;

    if (!payoutAccessAllowed || !isSupabaseConfigured) {
      if (isCurrent()) {
        setEvaluation(null);
        setError(
          isGuest
            ? 'Create an account to unlock payout evaluation.'
            : !userId
              ? 'Sign in to unlock payout evaluation.'
              : 'Payout evaluation is not configured.',
        );
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
      if (isCurrent()) {
        setEvaluation(parsed);
        setError(null);
      }
    } catch (err) {
      if (isCurrent()) {
        setEvaluation(null);
        setError(err instanceof Error ? err.message : 'Payout evaluation is unavailable.');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [accessScope, userId, isGuest, payoutAccessAllowed]);

  /**
   * Reads only the signed-in user's rows. The table policy is the authority:
   * we deliberately do not accept a user ID parameter from the client.
   * A failed/malformed result stays `null`, which lets the UI state honestly
   * that history is unavailable instead of impersonating an empty ledger.
   */
  const refreshHistory = useCallback(async () => {
    const generation = accessGeneration.current;
    const isCurrent = () =>
      mounted.current &&
      generation === accessGeneration.current &&
      activeAccessScope.current === accessScope;

    if (!payoutAccessAllowed || !isSupabaseConfigured) {
      if (isCurrent()) {
        setHistory(null);
        setHistoryError(
          isGuest
            ? 'Create an account to view payout history.'
            : !userId
              ? 'Sign in to view payout history.'
              : 'Payout history is not configured.',
        );
        setHistoryLoading(false);
      }
      return;
    }

    if (mounted.current) setHistoryLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('payout_requests')
        .select('id, cycle_start, amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (queryError) throw queryError;
      const parsed = parsePayoutRequests(data);
      if (!parsed) throw new Error('Payout history data is incomplete.');
      if (isCurrent()) {
        setHistory(parsed);
        setHistoryError(null);
      }
    } catch (err) {
      if (isCurrent()) {
        setHistory(null);
        setHistoryError(err instanceof Error ? err.message : 'Payout history is unavailable.');
      }
    } finally {
      if (isCurrent()) setHistoryLoading(false);
    }
  }, [accessScope, userId, isGuest, payoutAccessAllowed]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshEvaluation(), refreshHistory()]);
  }, [refreshEvaluation, refreshHistory]);

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
    if (isGuest) throw new Error('Create an account to request a payout.');
    if (!payoutAccessAllowed || !isSupabaseConfigured) {
      throw new Error('Payout evaluation is unavailable.');
    }
    const generation = accessGeneration.current;
    const isCurrent = () =>
      mounted.current &&
      generation === accessGeneration.current &&
      activeAccessScope.current === accessScope;
    const { data, error: rpcError } = await supabase.rpc('request_evaluation_payout');
    if (rpcError) throw rpcError;
    const parsed = parsePayoutEvaluation(data);
    if (!parsed) throw new Error('Payout request returned incomplete data.');
    if (!isCurrent()) throw new Error('Payout request is unavailable.');
    if (isCurrent()) {
      setEvaluation(parsed);
      setError(null);
    }
    // The row commits in the same RPC transaction. Refresh after it resolves
    // so the history card shows the reservation immediately.
    await refreshHistory();
    return parsed;
  }, [accessScope, isGuest, payoutAccessAllowed, refreshHistory]);

  return {
    evaluation,
    loading,
    error,
    history,
    historyLoading,
    historyError,
    refresh,
    refreshHistory,
    requestPayout,
  };
}
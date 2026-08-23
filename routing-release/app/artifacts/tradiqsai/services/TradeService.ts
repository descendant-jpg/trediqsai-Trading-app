import { supabase } from '@/utils/supabase';
import { calculateUserRank, type RankTier } from '@/lib/rankLogic';

export type TradeRecord = {
  id: string;
  user_id: string;
  asset: string;
  side: 'BUY' | 'SELL';
  entry_price: number;
  close_price: number | null;
  status: 'OPEN' | 'CLOSED';
  pnl?: number | null;
  rankChange?: { previousRank: RankTier; newRank: RankTier } | null;
};

export async function updateUserRankTier(
  userId: string,
): Promise<{ changed: boolean; previousRank: RankTier; newRank: RankTier }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('simulated_pnl, win_rate, rank_tier')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);

  const previousRank = (data.rank_tier ?? 'Bronze') as RankTier;
  const newRank = calculateUserRank(Number(data.simulated_pnl ?? 0), Number(data.win_rate ?? 0));
  if (newRank === previousRank) return { changed: false, previousRank, newRank };

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ rank_tier: newRank })
    .eq('id', userId);
  if (updateError) throw new Error(updateError.message);
  return { changed: true, previousRank, newRank };
}

/**
 * Errors that mean "the guarded path is unavailable", as opposed to "the
 * guarded path ran and said no".
 *
 * PGRST202 = the RPC does not exist yet (migration 014 not applied).
 * 55000    = no fresh server price is published right now.
 *
 * Any other error is a real refusal (e.g. a blown account) and must NOT be
 * retried through the unguarded insert — doing so would let the client walk
 * straight around the rule the RPC just enforced.
 */
function isGuardedPathUnavailable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '55000';
}

/**
 * Opens a trade for the authenticated user.
 *
 * The price is chosen by the server, not by this client: `open_server_trade`
 * reads the service-role-owned `market_prices` row and stamps the trade as
 * verified. That matters because payout eligibility is computed only from
 * verified trades — a client that picked its own entry price could otherwise
 * fabricate profit and cash it out.
 *
 * If the guarded path is unavailable the trade still records through the
 * plain insert so the simulator keeps working, but it is marked client-priced
 * and can never count toward a payout.
 */
export async function openTrade(
  asset: string,
  side: 'BUY' | 'SELL',
  currentPrice: number,
): Promise<TradeRecord> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data: rpcData, error: rpcError } = await supabase.rpc('open_server_trade', {
    p_asset: asset,
    p_side: side,
    p_position_size_usd: 0,
  });

  let trade: TradeRecord;
  if (!rpcError && rpcData) {
    trade = rpcData as TradeRecord;
  } else {
    if (rpcError && !isGuardedPathUnavailable(rpcError)) {
      // The guarded path ran and refused (e.g. blown account). Respect it.
      throw new Error(rpcError.message);
    }
    const { data, error } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        asset,
        side,
        entry_price: currentPrice,
        status: 'OPEN',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    trade = data as TradeRecord;
  }

  const rankChange = await updateUserRankTier(trade.user_id);
  return { ...trade, rankChange: rankChange.changed ? rankChange : null };
}

/**
 * Closes an open trade at the server's price where possible (see openTrade).
 * The client-priced fallback keeps the simulator usable when the feed is
 * down, at the cost of the trade no longer counting toward a payout.
 */
export async function closeTrade(
  tradeId: string,
  closePrice: number,
): Promise<TradeRecord> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('close_server_trade', {
    p_trade_id: tradeId,
  });
  if (!rpcError && rpcData) return rpcData as TradeRecord;
  if (rpcError && !isGuardedPathUnavailable(rpcError)) {
    throw new Error(rpcError.message);
  }

  const { data, error } = await supabase
    .from('trades')
    .update({ status: 'CLOSED', close_price: closePrice })
    .eq('id', tradeId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as TradeRecord;
}

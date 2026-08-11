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
 * Opens a trade for the authenticated user. P&L is never computed here —
 * a Postgres trigger on the `trades` table owns that (server-side, so
 * clients can't manipulate results).
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
  const trade = data as TradeRecord;
  const rankChange = await updateUserRankTier(trade.user_id);
  return { ...trade, rankChange: rankChange.changed ? rankChange : null };
}

/**
 * Closes an open trade. Only status and close price are written; the
 * database trigger computes and stores the final P&L.
 */
export async function closeTrade(
  tradeId: string,
  closePrice: number,
): Promise<TradeRecord> {
  const { data, error } = await supabase
    .from('trades')
    .update({ status: 'CLOSED', close_price: closePrice })
    .eq('id', tradeId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as TradeRecord;
}

import { supabase } from '@/utils/supabase';

export type TierLevel = 'Free' | 'Pro' | 'Elite' | 'Whale';
export type PartnerTier = 'Ambassador' | 'Elite' | 'Master';
export type TradeStatus = 'OPEN' | 'CLOSED';

export type UserProfile = {
  id: string;
  username: string | null;
  email?: string | null;
  simulated_balance: number;
  tier_level: TierLevel;
  is_verified: boolean;
};

export type SimulatedTradeInput = {
  user_id: string;
  asset: string;
  order_type: string;
  side?: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: number;
  unrealized_pnl?: number;
};

export type SimulatedTrade = SimulatedTradeInput & {
  id: string;
  status: TradeStatus;
  created_at: string;
};

export type AiSignal = {
  id: string;
  asset: string;
  entry_price: number;
  take_profit: number;
  stop_loss: number;
  is_vip_only: boolean;
  direction?: string;
  created_at?: string;
};

export type AffiliateStats = {
  partner_id: string;
  referral_code: string | null;
  total_earnings: number;
  tier_level: PartnerTier;
};

async function query<T>(request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function getUserProfile(userId: string) {
  return query<UserProfile>(supabase.from('profiles').select('*').eq('id', userId).single());
}

export async function updateSimulatedBalance(userId: string, newBalance: number) {
  return query<UserProfile>(supabase.from('profiles').update({ simulated_balance: newBalance }).eq('id', userId).select('*').single());
}

export async function executeSimulatedTrade(tradeData: SimulatedTradeInput) {
  return query<SimulatedTrade>(supabase.from('simulated_trades').insert(tradeData).select('*').single());
}

export async function getActiveTrades(userId: string) {
  return query<SimulatedTrade[]>(supabase.from('simulated_trades').select('*').eq('user_id', userId).eq('status', 'OPEN').order('created_at', { ascending: false }));
}

export async function closeTrade(tradeId: string) {
  return query<SimulatedTrade>(supabase.from('simulated_trades').update({ status: 'CLOSED' }).eq('id', tradeId).select('*').single());
}

export async function fetchAiSignals(isVip: boolean) {
  const request = isVip
    ? supabase.from('ai_signals').select('*').order('created_at', { ascending: false })
    : supabase.from('ai_signals').select('*').eq('is_vip_only', false).order('created_at', { ascending: false });
  return query<AiSignal[]>(request);
}

export async function getAffiliateStats(partnerId: string) {
  return query<AffiliateStats>(supabase.from('affiliates').select('*').eq('partner_id', partnerId).single());
}
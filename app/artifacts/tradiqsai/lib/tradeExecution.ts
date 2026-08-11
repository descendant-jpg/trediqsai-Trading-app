import { supabase } from '@/utils/supabase';
import type { Signal } from '@workspace/api-client-react';

export const SIMULATED_BALANCE_USD = 10_000;

export type TradeExecutionResult = {
  id: string;
  positionSizeUsd: number;
  status: 'open';
};

export async function executeSimulatedTrade(
  userId: string,
  signal: Signal,
  riskPercentage: 1 | 2 | 5,
): Promise<TradeExecutionResult> {
  const positionSizeUsd = Number((SIMULATED_BALANCE_USD * (riskPercentage / 100)).toFixed(2));
  const tp1 = signal.takeProfits[0]?.price;
  if (tp1 == null) throw new Error('This signal does not have a take-profit target.');

  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      signal_id: signal.id,
      asset: signal.asset,
      side: signal.direction,
      direction: signal.direction,
      entry_price: signal.entry.price,
      take_profit: tp1,
      stop_loss: signal.stopLoss.price,
      position_size_usd: positionSizeUsd,
      status: 'OPEN',
    })
    .select('id, position_size_usd, status')
    .single();

  if (error) throw new Error(error.message);
  return {
    id: String(data.id),
    positionSizeUsd: Number(data.position_size_usd),
    status: 'open',
  };
}
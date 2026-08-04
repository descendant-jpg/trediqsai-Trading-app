import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  BalanceCard,
  DrawdownBar,
  ExecutionButtons,
  PositionCard,
  TerminalHeader,
} from '@/components/trading';
import { TradingChart } from '@/components/wagmi-chart';
import { LivePriceTicker } from '@/components/live-ticker';
import { ProWindDownBanner } from '@/components/paywall';
import { useLiveMarket } from '@/hooks/useLiveMarket';
import * as TradeService from '@/services/TradeService';
import { useTrading, type TradeResult } from '@/context/TradingContext';
import colors from '@/constants/colors';
import { useLocalSearchParams } from 'expo-router';

const c = colors.light;

function formatMoney(n: number) {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function TradingFloorScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const params = useLocalSearchParams<{ symbol?: string; direction?: string }>();

  const signalSymbol =
    typeof params.symbol === 'string' && params.symbol ? params.symbol : undefined;
  const signalDirection =
    params.direction === 'BUY' || params.direction === 'SELL'
      ? params.direction
      : undefined;

  const {
    price,
    equity,
    position,
    unrealizedPnl,
    drawdownUsed,
    distanceToPayout,
    buy,
    sell,
  } = useTrading();
  const [message, setMessage] = useState<string | null>(null);
  const { livePrice, chartData, heartbeat, connected } = useLiveMarket();
  const [executing, setExecuting] = useState(false);

  /**
   * Runs the local simulated trade, then records it to Supabase via
   * TradeService. Buttons stay disabled until the network call settles so
   * spam-taps can't open duplicate trades.
   */
  const executeTrade = useCallback(
    async (side: 'BUY' | 'SELL', localAction: () => TradeResult) => {
      if (executing) return;
      setExecuting(true);
      const result = localAction();
      handleResult(result);
      try {
        // Persist only genuine opens; closes are handled by the sim engine
        // (recording closes requires the persisted trade id — future work).
        // Skip when no valid live price has arrived yet.
        if (result.kind === 'opened' && livePrice > 0) {
          await TradeService.openTrade('BTC/USD', side, livePrice);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        setMessage(
          reason === 'User not authenticated'
            ? 'Simulated only — sign in to record trades'
            : `Trade not recorded: ${reason}`,
        );
      } finally {
        setExecuting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [executing, livePrice],
  );

  const handleResult = useCallback((result: TradeResult) => {
    if (result.kind === 'blocked') {
      setMessage(result.reason);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else if (result.kind === 'closed') {
      const { pnl } = result.trade;
      setMessage(
        `Position closed: ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`,
      );
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          pnl >= 0
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
      }
    } else {
      setMessage(null);
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <TerminalHeader />
      <ProWindDownBanner />

      <View style={styles.content}>
        <View>
          <BalanceCard
            balance={formatMoney(equity)}
            distanceToPayout={formatMoney(distanceToPayout)}
          />
          <DrawdownBar used={drawdownUsed} />
        </View>

        <View>
          <LivePriceTicker
            livePrice={livePrice}
            heartbeat={heartbeat}
            connected={connected}
          />
          <TradingChart symbol={signalSymbol} data={chartData} />
        </View>

        <View style={styles.bottom}>
          {position ? (
            <PositionCard
              side={position.side}
              entryPrice={position.entryPrice}
              size={position.size}
              price={price}
              pnl={unrealizedPnl}
            />
          ) : (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>QQX INDEX</Text>
              <Text style={styles.priceValue}>{price.toFixed(2)}</Text>
            </View>
          )}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <ExecutionButtons
            onBuy={() => executeTrade('BUY', buy)}
            onSell={() => executeTrade('SELL', sell)}
            disabled={executing}
            buyLabel={position?.side === 'SHORT' ? 'BUY / CLOSE' : 'BUY'}
            sellLabel={position?.side === 'LONG' ? 'SELL / CLOSE' : 'SELL'}
            preselected={position ? undefined : signalDirection}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  bottom: {
    gap: 10,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  priceLabel: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
  },
  priceValue: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  message: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
});

import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  BalanceCard,
  DrawdownBar,
  ExecutionButtons,
  TerminalHeader,
  TradeSide,
} from '@/components/trading';
import { TradingChart } from '@/components/wagmi-chart';
import colors from '@/constants/colors';

const c = colors.light;

const STARTING_BALANCE = 100_000;
const MARGIN = 1_000;
const PAYOUT_TARGET = 104_500;

function fireHaptic(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(style);
  }
}

function formatUsd(v: number): string {
  return `$${v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function TradingFloorScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [accountBalance, setAccountBalance] = useState<number>(STARTING_BALANCE);
  const [activeTrade, setActiveTrade] = useState<TradeSide>(null);
  const [lastPnl, setLastPnl] = useState<number | null>(null);
  // Synchronous re-entry guard: prevents double execution from rapid
  // multi-taps that land before React re-renders with the new state.
  const tradeLock = useRef<TradeSide>(null);

  const openTrade = (side: 'BUY' | 'SELL') => {
    if (tradeLock.current) return;
    tradeLock.current = side;
    fireHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setAccountBalance((b) => b - MARGIN);
    setActiveTrade(side);
    setLastPnl(null);
  };

  const closeTrade = () => {
    if (!tradeLock.current) return;
    tradeLock.current = null;
    fireHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    // Random P&L between -$500 and +$800; margin is returned on close.
    const pnl = Math.round((Math.random() * 1300 - 500) * 100) / 100;
    setAccountBalance((b) => b + MARGIN + pnl);
    setLastPnl(pnl);
    setActiveTrade(null);
  };

  const distanceToPayout = Math.max(PAYOUT_TARGET - accountBalance, 0);
  const drawdownUsed = Math.min(
    Math.max((STARTING_BALANCE - accountBalance) / 5_000, 0),
    1,
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <TerminalHeader />

      <View style={styles.content}>
        <View>
          <BalanceCard
            balance={formatUsd(accountBalance)}
            distanceToPayout={formatUsd(distanceToPayout)}
          />
          <DrawdownBar used={drawdownUsed} />
        </View>

        <TradingChart />

        <View>
          {activeTrade ? (
            <Text style={styles.statusLine}>
              <Text
                style={{
                  color: activeTrade === 'BUY' ? c.success : c.destructive,
                }}
              >
                {activeTrade}
              </Text>
              <Text style={styles.statusMuted}>
                {'  '}position open · ${MARGIN.toLocaleString()} margin
              </Text>
            </Text>
          ) : lastPnl !== null ? (
            <Text style={styles.statusLine}>
              <Text style={styles.statusMuted}>Last trade P&L{'  '}</Text>
              <Text
                style={{ color: lastPnl >= 0 ? c.success : c.destructive }}
              >
                {lastPnl >= 0 ? '+' : '-'}
                {formatUsd(Math.abs(lastPnl))}
              </Text>
            </Text>
          ) : null}

          <ExecutionButtons
            activeTrade={activeTrade}
            onBuy={() => openTrade('BUY')}
            onSell={() => openTrade('SELL')}
            onClose={closeTrade}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  statusLine: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginBottom: 10,
  },
  statusMuted: {
    color: c.mutedForeground,
    fontFamily: 'Inter_500Medium',
  },
});

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import colors from '@/constants/colors';

const c = colors.light;

/** Sleek top header with the app wordmark. */
export function TerminalHeader() {
  return (
    <View style={headerStyles.container}>
      <Text style={headerStyles.wordmark}>
        TradiQs <Text style={headerStyles.ai}>AI</Text>
      </Text>
      <View style={headerStyles.statusDot} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  wordmark: {
    color: c.foreground,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  ai: {
    color: c.primary,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.success,
  },
});

/** Simulated balance card with distance-to-payout line. */
export function BalanceCard({
  balance,
  distanceToPayout,
}: {
  balance: string;
  distanceToPayout: string;
}) {
  return (
    <View style={balanceStyles.card}>
      <Text style={balanceStyles.label}>SIMULATED BALANCE</Text>
      <Text style={balanceStyles.balance}>{balance}</Text>
      <Text style={balanceStyles.payout}>
        Distance to Payout: {distanceToPayout}
      </Text>
    </View>
  );
}

const balanceStyles = StyleSheet.create({
  card: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  label: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  balance: {
    color: c.foreground,
    fontSize: 44,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 6,
  },
  payout: {
    color: c.primary,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
});

/**
 * Segmented daily drawdown bar — indicates how much of the daily risk
 * limit has been consumed. `used` is a 0..1 fraction.
 */
export function DrawdownBar({
  used,
  segments = 10,
}: {
  used: number;
  segments?: number;
}) {
  const filled = Math.round(Math.min(Math.max(used, 0), 1) * segments);
  return (
    <View style={drawdownStyles.container}>
      <View style={drawdownStyles.labelRow}>
        <Text style={drawdownStyles.label}>DAILY DRAWDOWN</Text>
        <Text style={drawdownStyles.value}>
          {Math.round(used * 100)}% used
        </Text>
      </View>
      <View style={drawdownStyles.track}>
        {Array.from({ length: segments }, (_, i) => (
          <View
            key={i}
            style={[
              drawdownStyles.segment,
              i < filled
                ? drawdownStyles.segmentFilled
                : drawdownStyles.segmentEmpty,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const drawdownStyles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
  },
  value: {
    color: c.destructive,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  track: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  segmentFilled: {
    backgroundColor: c.destructive,
  },
  segmentEmpty: {
    backgroundColor: c.border,
  },
});

/** Massive BUY / SELL execution buttons. */
export function ExecutionButtons({
  onBuy,
  onSell,
}: {
  onBuy?: () => void;
  onSell?: () => void;
}) {
  const press = (cb?: () => void) => () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    cb?.();
  };

  return (
    <View style={execStyles.row}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[execStyles.button, execStyles.buy]}
        onPress={press(onBuy)}
        testID="buy-button"
      >
        <Text style={execStyles.buttonText}>BUY</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[execStyles.button, execStyles.sell]}
        onPress={press(onSell)}
        testID="sell-button"
      >
        <Text style={[execStyles.buttonText, execStyles.sellText]}>SELL</Text>
      </TouchableOpacity>
    </View>
  );
}

const execStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 68,
    borderRadius: colors.radius,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  buy: {
    backgroundColor: c.success,
    shadowColor: c.success,
  },
  sell: {
    backgroundColor: c.destructive,
    shadowColor: c.destructive,
  },
  buttonText: {
    color: '#0A0B0E',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  sellText: {
    color: '#FFFFFF',
  },
});

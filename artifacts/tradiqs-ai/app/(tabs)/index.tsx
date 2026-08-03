import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BalanceCard,
  ChartPlaceholder,
  DrawdownBar,
  ExecutionButtons,
  TerminalHeader,
} from '@/components/trading';
import colors from '@/constants/colors';

const c = colors.light;

export default function TradingFloorScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <TerminalHeader />

      <View style={styles.content}>
        <View>
          <BalanceCard balance="$100,000.00" distanceToPayout="$4,500" />
          <DrawdownBar used={0.3} />
        </View>

        <ChartPlaceholder />

        <ExecutionButtons />
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
});

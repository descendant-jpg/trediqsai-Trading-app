import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-wagmi-charts';
import colors from '@/constants/colors';

const c = colors.light;

/**
 * Mock volatile BTC price series — 20 timestamped points at 1-minute
 * intervals, with realistic swings.
 */
export const MOCK_BTC_DATA: { timestamp: number; value: number }[] = (() => {
  const base = 1754200000000; // fixed epoch base for stable mock data
  const prices = [
    64230, 64510, 64180, 63920, 64340, 64890, 65120, 64760, 64410, 64980,
    65440, 65210, 64850, 65530, 66010, 65670, 65290, 65880, 66240, 65950,
  ];
  return prices.map((value, i) => ({
    timestamp: base + i * 60_000,
    value,
  }));
})();

const CHART_HEIGHT = 210;
const LAST_PRICE = MOCK_BTC_DATA[MOCK_BTC_DATA.length - 1].value;

/**
 * Worklet-safe USD formatter (no Intl/toLocaleString — those are unsafe
 * inside Reanimated worklets on Hermes).
 */
function formatUsdWorklet(v: number): string {
  'worklet';
  const rounded = Math.round(v);
  let s = String(rounded);
  let out = '';
  while (s.length > 3) {
    out = ',' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return '$' + s + out;
}

/**
 * Interactive BTC line chart (react-native-wagmi-charts):
 * Electric Cyan path + gradient fill, Neon Purple crosshair cursor.
 * A single shared Provider drives both the header price/time readout and
 * the chart, so dragging the crosshair updates the header live.
 */
export function TradingChart() {
  return (
    <View style={styles.container} testID="trading-chart">
      <LineChart.Provider data={MOCK_BTC_DATA}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.symbol}>BTC / USD</Text>
            <Text style={styles.feedLabel}>SIMULATED FEED</Text>
          </View>
          <View style={styles.priceBlock}>
            <LineChart.PriceText
              format={({ value }) => {
                'worklet';
                const v = value ? parseFloat(value) : LAST_PRICE;
                return formatUsdWorklet(v);
              }}
              style={styles.price}
            />
            <LineChart.DatetimeText
              options={{ hour: '2-digit', minute: '2-digit' }}
              style={styles.datetime}
            />
          </View>
        </View>

        <LineChart
          height={CHART_HEIGHT}
          width={Dimensions.get('window').width - 42}
        >
          <LineChart.Path color="#00F0FF" width={3}>
            <LineChart.Gradient color="#00F0FF" />
          </LineChart.Path>
          <LineChart.CursorCrosshair color="#B026FF" />
        </LineChart>
      </LineChart.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: colors.radius,
    backgroundColor: c.card,
    overflow: 'hidden',
    paddingBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  symbol: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  feedLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginTop: 3,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    color: c.primary,
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  datetime: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
});

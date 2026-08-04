import React from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PaywallCard } from '@/components/paywall';
import colors from '@/constants/colors';

const c = colors.light;

type Signal = {
  id: string;
  symbol: string;
  name: string;
  action: 'BUY' | 'SELL';
  confidence: number;
  price: string;
  target: string;
  timeframe: string;
  time: string;
  pro: boolean;
  rationale: string;
};

const SIGNALS: Signal[] = [
  {
    id: 's1',
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    action: 'BUY',
    confidence: 92,
    price: '$128.44',
    target: '$142.00',
    timeframe: '1–2 weeks',
    time: '2m ago',
    pro: true,
    rationale: 'Momentum breakout above 20-day range on rising volume; AI-sector flows accelerating.',
  },
  {
    id: 's2',
    symbol: 'BTC',
    name: 'Bitcoin',
    action: 'BUY',
    confidence: 87,
    price: '$96,210',
    target: '$104,500',
    timeframe: '3–5 days',
    time: '9m ago',
    pro: false,
    rationale: 'Funding reset with spot bid returning; reclaim of key level flips structure bullish.',
  },
  {
    id: 's3',
    symbol: 'TSLA',
    name: 'Tesla Inc',
    action: 'SELL',
    confidence: 78,
    price: '$243.10',
    target: '$226.00',
    timeframe: '1 week',
    time: '18m ago',
    pro: true,
    rationale: 'Bearish divergence on RSI with delivery estimates trimmed; distribution at resistance.',
  },
  {
    id: 's4',
    symbol: 'ETH',
    name: 'Ethereum',
    action: 'BUY',
    confidence: 81,
    price: '$3,412',
    target: '$3,780',
    timeframe: '1–2 weeks',
    time: '34m ago',
    pro: false,
    rationale: 'ETH/BTC ratio basing; staking inflows and L2 activity trending higher.',
  },
  {
    id: 's5',
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    action: 'BUY',
    confidence: 74,
    price: '$168.92',
    target: '$181.00',
    timeframe: '2 weeks',
    time: '1h ago',
    pro: false,
    rationale: 'Datacenter guidance beat; pullback to rising 50-day offers favorable entry.',
  },
  {
    id: 's6',
    symbol: 'SOL',
    name: 'Solana',
    action: 'SELL',
    confidence: 69,
    price: '$212.35',
    target: '$194.00',
    timeframe: '3–5 days',
    time: '2h ago',
    pro: true,
    rationale: 'Overheated perp funding and slowing DEX volume; rotation risk into majors.',
  },
  {
    id: 's7',
    symbol: 'AAPL',
    name: 'Apple Inc',
    action: 'BUY',
    confidence: 71,
    price: '$229.87',
    target: '$241.00',
    timeframe: '2–3 weeks',
    time: '3h ago',
    pro: false,
    rationale: 'Services growth re-rating; buyback support with seasonality tailwind into earnings.',
  },
];

function SignalCard({ signal }: { signal: Signal }) {
  const isBuy = signal.action === 'BUY';
  const actionColor = isBuy ? c.success : c.destructive;
  const accent = signal.pro ? c.secondary : c.primary;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.cardHeader}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{signal.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {signal.name}
          </Text>
        </View>
        {signal.pro ? (
          <View style={[styles.badge, { backgroundColor: 'rgba(176,38,255,0.15)', borderColor: c.secondary }]}>
            <Feather name="star" size={10} color={c.secondary} />
            <Text style={[styles.badgeText, { color: c.secondary }]}>PRO</Text>
          </View>
        ) : (
          <View style={[styles.badge, { backgroundColor: 'rgba(0,240,255,0.12)', borderColor: c.primary }]}>
            <Feather name="zap" size={10} color={c.primary} />
            <Text style={[styles.badgeText, { color: c.primary }]}>AI</Text>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <View style={[styles.actionPill, { backgroundColor: actionColor }]}>
          <Feather name={isBuy ? 'trending-up' : 'trending-down'} size={12} color={c.background} />
          <Text style={styles.actionText}>{signal.action}</Text>
        </View>
        <Text style={styles.confidence}>
          <Text style={{ color: accent }}>{signal.confidence}%</Text> confidence
        </Text>
        <Text style={styles.time}>{signal.time}</Text>
      </View>

      <Text style={styles.rationale}>{signal.rationale}</Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Entry</Text>
          <Text style={styles.metaValue}>{signal.price}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Target</Text>
          <Text style={[styles.metaValue, { color: actionColor }]}>{signal.target}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Horizon</Text>
          <Text style={styles.metaValue}>{signal.timeframe}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AISignalsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="zap" size={20} color={c.primary} />
        <Text style={styles.headerTitle}>AI Signals</Text>
      </View>
      {/* Locked signals feed — dimmed and non-interactive behind the paywall */}
      <View style={styles.lockedContent} pointerEvents="none">
        <FlatList
          data={SIGNALS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SignalCard signal={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      </View>

      {/* Centered Pro Tier paywall overlay */}
      <View style={styles.paywallOverlay}>
        <PaywallCard />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: c.foreground,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  lockedContent: {
    flex: 1,
    opacity: 0.2,
  },
  paywallOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: c.card,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    borderLeftWidth: 3,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flex: 1,
  },
  symbol: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  name: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flexShrink: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    color: c.background,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  confidence: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  time: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginLeft: 'auto',
  },
  rationale: {
    color: c.foreground,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
    opacity: 0.85,
  },
  metaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
  },
  metaItem: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    color: c.foreground,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});

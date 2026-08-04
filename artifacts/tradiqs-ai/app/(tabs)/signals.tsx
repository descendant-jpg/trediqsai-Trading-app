import React from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PaywallCard } from '@/components/paywall';
import colors from '@/constants/colors';
import { useGetSignals, type Signal } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

function SignalCard({
  signal,
  onTrade,
}: {
  signal: Signal;
  onTrade: (signal: Signal) => void;
}) {
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

      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.tradeButton, { backgroundColor: actionColor }]}
        onPress={() => onTrade(signal)}
        testID={`trade-signal-${signal.id}`}
      >
        <Feather
          name={isBuy ? 'trending-up' : 'trending-down'}
          size={14}
          color={isBuy ? c.background : '#FFFFFF'}
        />
        <Text
          style={[
            styles.tradeButtonText,
            { color: isBuy ? c.background : '#FFFFFF' },
          ]}
        >
          Trade this — {signal.action} {signal.symbol}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AISignalsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { data: signals, isLoading: signalsLoading, isError, refetch } = useGetSignals();
  const { isSubscribed, isLoading: subLoading } = useSubscription();
  const router = useRouter();

  const isLoading = signalsLoading || subLoading;

  const handleTrade = (signal: Signal) => {
    router.push({
      pathname: '/(tabs)',
      params: { symbol: signal.symbol, direction: signal.action },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="zap" size={20} color={c.primary} />
        <Text style={styles.headerTitle}>AI Signals</Text>
        {isSubscribed && (
          <View style={styles.proBadge}>
            <Feather name="star" size={11} color={c.secondary} />
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={c.primary} />
          <Text style={styles.stateText}>Loading signals…</Text>
        </View>
      ) : isError ? (
        <View style={styles.stateBox}>
          <Feather name="alert-circle" size={24} color={c.destructive} />
          <Text style={styles.stateText}>Couldn't load signals.</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : isSubscribed ? (
        /* Full signals feed — unlocked for Pro subscribers */
        <FlatList
          data={signals ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SignalCard signal={item} onTrade={handleTrade} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        /* Locked signals feed — dimmed and non-interactive behind the paywall */
        <>
          <View style={styles.lockedContent} pointerEvents="none">
            <FlatList
              data={signals ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <SignalCard signal={item} onTrade={handleTrade} />}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          </View>
          {/* Centered Pro Tier paywall overlay */}
          <View style={styles.paywallOverlay}>
            <PaywallCard />
          </View>
        </>
      )}
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
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(176,38,255,0.15)',
    borderWidth: 1,
    borderColor: c.secondary,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 4,
  },
  proBadgeText: {
    color: c.secondary,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
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
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  stateText: {
    color: c.mutedForeground,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: c.primary,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  tradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 2,
  },
  tradeButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
});

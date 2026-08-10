import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ManageSubscriptionCard, ProWindDownBanner } from '@/components/paywall';
import { PaywallModal } from '@/components/PaywallModal';
import SignalDetailModal from '@/components/SignalDetailModal';
import colors from '@/constants/colors';
import { useGetSignals, type Signal } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  Active: { color: '#00F0FF', label: 'ACTIVE' },
  Pending: { color: '#F5A623', label: 'PENDING' },
  Won: { color: '#2ECA8B', label: 'WON' },
  'SL Hit': { color: '#E54B4B', label: 'SL HIT' },
};

const FILTERS = ['All', 'Free', 'Premium', 'Active', 'Pending', 'Closed'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Paywall policy for Premium signals (locked = isPremium + non-subscriber):
 * - Free users MAY see: asset, name, PRO tag, BUY/SELL direction, timeframe, timestamp.
 * - Premium (hidden when locked): rationale (replaced by a generic teaser),
 *   Won/SL Hit outcome, and Entry/TP/SL values (redacted to placeholders so
 *   the real numbers never render, in addition to the blur).
 */
const LOCKED_PLACEHOLDER = '•••';

export const LOCKED_RATIONALE_TEASER =
  'AI rationale locked — upgrade to Pro to see why this trade was called.';

function matchesFilter(signal: Signal, filter: Filter): boolean {
  switch (filter) {
    case 'All':
      return true;
    case 'Free':
      return !signal.isPremium;
    case 'Premium':
      return signal.isPremium;
    case 'Active':
      return signal.status === 'Active';
    case 'Pending':
      return signal.status === 'Pending';
    case 'Closed':
      return signal.status === 'Won' || signal.status === 'SL Hit';
  }
}

function TargetsBlock({ signal, locked }: { signal: Signal; locked: boolean }) {
  const tp1 = signal.takeProfits[0];
  const rest = signal.takeProfits.slice(1);
  const hits = signal.takeProfits.filter((tp) => tp.isHit).length;

  return (
    <View style={{ gap: 10 }}>
      {/* Main 3-column grid */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Entry</Text>
          <Text style={styles.metaValue}>{locked ? LOCKED_PLACEHOLDER : signal.entry.price}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>SL</Text>
          <Text style={[styles.metaValue, { color: '#E54B4B' }]}>
            {locked
              ? LOCKED_PLACEHOLDER
              : signal.stopLoss.isBreakeven
                ? 'SL - BE'
                : signal.stopLoss.price}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.metaLabel, { color: '#00F0FF' }]}>TP1</Text>
            {!locked && tp1?.isHit && <Feather name="check-circle" size={10} color="#2ECA8B" />}
          </View>
          <Text style={styles.metaValue}>{locked ? LOCKED_PLACEHOLDER : tp1?.price}</Text>
        </View>
      </View>

      {/* Secondary targets row */}
      <View style={styles.secondaryRow}>
        {rest.map((tp) => (
          <View key={tp.id} style={styles.secondaryTarget}>
            {!locked && tp.isHit ? (
              <View style={[styles.tpCircle, { backgroundColor: '#2ECA8B', borderColor: '#2ECA8B' }]}>
                <Feather name="check" size={8} color="#0A0B0E" />
              </View>
            ) : (
              <View style={styles.tpCircle} />
            )}
            <Text style={styles.secondaryLabel}>TP{tp.id}</Text>
            <Text style={styles.secondaryPrice}>{locked ? LOCKED_PLACEHOLDER : tp.price}</Text>
            <View style={styles.pipPill}>
              <Text style={styles.pipPillText}>{locked ? '•••' : `+${tp.pips}p`}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Progress row */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {locked ? 'Targets locked' : `${hits}/${signal.takeProfits.length} targets hit`}
        </Text>
        {!locked && (
          <View style={styles.progressDots}>
            {signal.takeProfits.map((tp) => (
              <View
                key={tp.id}
                style={[
                  styles.progressDot,
                  tp.isHit && { backgroundColor: '#2ECA8B', borderColor: '#2ECA8B' },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function SignalCard({
  signal,
  locked,
  onOpen,
  onTrade,
  onUpgrade,
}: {
  signal: Signal;
  locked: boolean;
  onOpen: (signal: Signal) => void;
  onTrade: (signal: Signal) => void;
  onUpgrade: () => void;
}) {
  const isBuy = signal.direction === 'BUY';
  const dirColor = isBuy ? '#00F0FF' : '#E54B4B';
  const accent = signal.isPremium ? c.secondary : c.primary;
  const status = STATUS_STYLES[signal.status] ?? STATUS_STYLES.Active;

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: accent }]}
      onPress={() => (locked ? onUpgrade() : onOpen(signal))}
      testID={`signal-card-${signal.id}`}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{signal.asset}</Text>
          <View style={[styles.dirPill, { backgroundColor: dirColor }]}>
            <Feather name={isBuy ? 'trending-up' : 'trending-down'} size={11} color="#0A0B0E" />
            <Text style={styles.dirText}>{signal.direction}</Text>
          </View>
          {signal.isPremium && (
            <View style={styles.proTag}>
              <Feather name="star" size={9} color={c.secondary} />
              <Text style={styles.proTagText}>PRO</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {locked ? (
            <View
              style={[styles.statusBadge, { borderColor: c.secondary, flexDirection: 'row', alignItems: 'center', gap: 3 }]}
              testID={`locked-status-${signal.id}`}
            >
              <Feather name="lock" size={9} color={c.secondary} />
              <Text style={[styles.statusText, { color: c.secondary }]}>PRO</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { borderColor: status.color }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          )}
          <Text style={styles.time}>{signal.time}</Text>
        </View>
      </View>

      <View style={styles.subRow}>
        <Text style={styles.name} numberOfLines={1}>
          {signal.name}
        </Text>
        <View style={styles.tfPill}>
          <Text style={styles.tfPillText}>{signal.timeframe}</Text>
        </View>
      </View>

      <Text style={[styles.rationale, locked && { fontStyle: 'italic', opacity: 0.6 }]}>
        {locked ? LOCKED_RATIONALE_TEASER : signal.rationale}
      </Text>

      {/* Entry / SL / TP — blurred behind the premium gate for locked signals */}
      <View>
        <TargetsBlock signal={signal} locked={locked} />
        {locked && (
          <View style={styles.lockOverlay}>
            <BlurView
              intensity={Platform.OS === 'web' ? 30 : 24}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.lockContent}>
              <Feather name="lock" size={16} color="#FFFFFF" />
              <TouchableOpacity
                style={styles.unlockButton}
                onPress={onUpgrade}
                activeOpacity={0.85}
                testID={`unlock-${signal.id}`}
              >
                <Text style={styles.unlockButtonText}>Upgrade to Pro to Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Bottom action row */}
      {!locked && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onOpen(signal)}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <Feather name="bar-chart-2" size={14} color={c.mutedForeground} />
            <Text style={styles.actionMuted}>Chart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onTrade(signal)}
            hitSlop={{ top: 8, bottom: 8 }}
            testID={`trade-signal-${signal.id}`}
          >
            <Feather name="zap" size={14} color="#00F0FF" />
            <Text style={styles.actionTrade}>Trade Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onOpen(signal)}
            hitSlop={{ top: 8, bottom: 8 }}
            testID={`details-${signal.id}`}
          >
            <Text style={styles.actionMuted}>Details</Text>
            <Feather name="chevron-right" size={14} color={c.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}
    </Pressable>
  );
}

export default function AISignalsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { data: signals, isLoading: signalsLoading, isError, refetch } = useGetSignals();
  const { isSubscribed, isLoading: subLoading, verificationPending } = useSubscription();
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [detailSignal, setDetailSignal] = useState<Signal | null>(null);

  const isLoading = signalsLoading || subLoading;

  const filtered = useMemo(
    () => (signals ?? []).filter((s) => matchesFilter(s, filter)),
    [signals, filter],
  );

  const handleTrade = (signal: Signal) => {
    router.push({
      pathname: '/tradiqsai' as never,
      params: { symbol: signal.asset, direction: signal.direction },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="zap" size={20} color={c.primary} />
        <Text style={styles.headerTitle}>TradiQsAI Signal</Text>
        {isSubscribed && (
          <View style={styles.proBadge}>
            <Feather name="star" size={11} color={c.secondary} />
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {!isSubscribed && (
        <View style={styles.trialBanner} testID="trial-banner">
          <Text style={styles.trialText}>10 of 10 trial signals remaining</Text>
          <TouchableOpacity
            style={styles.trialUpgrade}
            onPress={() => setPaywallOpen(true)}
            testID="trial-upgrade"
          >
            <Text style={styles.trialUpgradeText}>Upgrade</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
              testID={`filter-${f}`}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {verificationPending && (
        <View style={styles.verifyBanner} testID="subscription-verify-banner">
          <Feather name="wifi-off" size={12} color={c.mutedForeground} />
          <Text style={styles.verifyBannerText}>
            Couldn't verify subscription — retrying when back online
          </Text>
        </View>
      )}

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
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SignalCard
              signal={item}
              locked={item.isPremium && !isSubscribed}
              onOpen={setDetailSignal}
              onTrade={handleTrade}
              onUpgrade={() => setPaywallOpen(true)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>No signals match this filter.</Text>
            </View>
          }
          ListHeaderComponent={
            isSubscribed ? (
              <View style={{ gap: 12 }}>
                <ProWindDownBanner />
                <ManageSubscriptionCard />
              </View>
            ) : null
          }
        />
      )}

      {/* Signal detail view */}
      {detailSignal && (
        <SignalDetailModal signal={detailSignal} onClose={() => setDetailSignal(null)} />
      )}

      {/* Paywall modal opened from a locked signal card */}
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
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
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: '#16181D',
  },
  trialText: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  trialUpgrade: {
    backgroundColor: '#00F0FF',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trialUpgradeText: {
    color: '#0A0B0E',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  filterWrap: {
    marginBottom: 10,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 6,
    backgroundColor: '#16181D',
  },
  filterChipActive: {
    borderColor: '#00F0FF',
    backgroundColor: 'rgba(0,240,255,0.12)',
  },
  filterChipText: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  filterChipTextActive: {
    color: '#00F0FF',
    fontFamily: 'Inter_700Bold',
  },
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  verifyBannerText: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    borderLeftWidth: 3,
    padding: 14,
    gap: 10,
    ...Platform.select({
      web: { boxShadow: '0 0 12px rgba(0,240,255,0.06)' } as object,
      default: {},
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  symbol: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  dirPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dirText: {
    color: '#0A0B0E',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  name: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flexShrink: 1,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tfPill: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tfPillText: {
    color: c.mutedForeground,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  proTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(176,38,255,0.15)',
    borderWidth: 1,
    borderColor: c.secondary,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  proTagText: {
    color: c.secondary,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  time: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
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
  secondaryRow: {
    flexDirection: 'row',
    gap: 16,
  },
  secondaryTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tpCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  secondaryPrice: {
    color: c.foreground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  pipPill: {
    backgroundColor: 'rgba(46,202,139,0.12)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pipPillText: {
    color: '#2ECA8B',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  progressDots: {
    flexDirection: 'row',
    gap: 5,
  },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unlockButton: {
    backgroundColor: '#00F0FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  unlockButtonText: {
    color: '#0A0B0E',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionMuted: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  actionTrade: {
    color: '#00F0FF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
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
});

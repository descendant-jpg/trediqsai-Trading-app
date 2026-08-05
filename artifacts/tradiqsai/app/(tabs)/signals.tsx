import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ManageSubscriptionCard, PaywallCard, ProWindDownBanner } from '@/components/paywall';
import colors from '@/constants/colors';
import { useGetSignals, type Signal } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: '#00F0FF', label: 'ACTIVE' },
  WON: { color: '#2ECA8B', label: 'WON' },
  LOST: { color: '#E54B4B', label: 'LOST' },
};

/**
 * Paywall policy for Pro signals (locked = pro signal + non-subscriber):
 * - Free users MAY see: symbol, name, PRO tag, BUY/SELL direction, timestamp.
 * - Premium (hidden when locked): rationale (replaced by a generic teaser),
 *   confidence %, WON/LOST outcome, and Entry/TP/SL values (redacted to
 *   placeholders so the real numbers never render, in addition to the blur).
 */
const LOCKED_PLACEHOLDER = '•••';

function TargetsRow({ signal, locked }: { signal: Signal; locked: boolean }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaItem}>
        <Text style={styles.metaLabel}>Entry</Text>
        <Text style={styles.metaValue}>{locked ? LOCKED_PLACEHOLDER : signal.price}</Text>
      </View>
      <View style={styles.metaItem}>
        <Text style={styles.metaLabel}>Take Profit</Text>
        <Text style={[styles.metaValue, { color: '#2ECA8B' }]}>
          {locked ? LOCKED_PLACEHOLDER : signal.target}
        </Text>
      </View>
      <View style={styles.metaItem}>
        <Text style={styles.metaLabel}>Stop Loss</Text>
        <Text style={[styles.metaValue, { color: '#E54B4B' }]}>
          {locked ? LOCKED_PLACEHOLDER : signal.stopLoss}
        </Text>
      </View>
    </View>
  );
}

function SignalCard({
  signal,
  locked,
  onTrade,
  onUpgrade,
}: {
  signal: Signal;
  locked: boolean;
  onTrade: (signal: Signal) => void;
  onUpgrade: () => void;
}) {
  const isBuy = signal.action === 'BUY';
  const actionColor = isBuy ? '#00F0FF' : '#E54B4B';
  const accent = signal.pro ? c.secondary : c.primary;
  const status = STATUS_STYLES[signal.status] ?? STATUS_STYLES.ACTIVE;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.cardHeader}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{signal.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {signal.name}
          </Text>
        </View>
        <View style={styles.badgeRow}>
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
          <View style={[styles.actionPill, { backgroundColor: actionColor }]}>
            <Feather name={isBuy ? 'trending-up' : 'trending-down'} size={12} color="#0A0B0E" />
            <Text style={styles.actionText}>{signal.action}</Text>
          </View>
        </View>
      </View>

      <View style={styles.subRow}>
        {signal.pro && (
          <View style={styles.proTag}>
            <Feather name="star" size={9} color={c.secondary} />
            <Text style={styles.proTagText}>PRO</Text>
          </View>
        )}
        {locked ? (
          <Text style={styles.confidence}>Confidence locked</Text>
        ) : (
          <Text style={styles.confidence}>
            <Text style={{ color: accent }}>{signal.confidence}%</Text> confidence
          </Text>
        )}
        <Text style={styles.time}>{signal.time}</Text>
      </View>

      <Text style={[styles.rationale, locked && { fontStyle: 'italic', opacity: 0.6 }]}>
        {locked ? LOCKED_RATIONALE_TEASER : signal.rationale}
      </Text>

      {/* Entry / TP / SL — blurred behind the premium gate for locked pro signals */}
      <View>
        <TargetsRow signal={signal} locked={locked} />
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

      {!locked && (
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
            style={[styles.tradeButtonText, { color: isBuy ? c.background : '#FFFFFF' }]}
          >
            Trade this — {signal.action} {signal.symbol}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function AISignalsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { data: signals, isLoading: signalsLoading, isError, refetch } = useGetSignals();
  const { isSubscribed, isLoading: subLoading, verificationPending } = useSubscription();
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);

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
          data={signals ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SignalCard
              signal={item}
              locked={item.pro && !isSubscribed}
              onTrade={handleTrade}
              onUpgrade={() => setPaywallOpen(true)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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

      {/* Paywall modal opened from a locked signal card */}
      <Modal
        visible={paywallOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPaywallOpen(false)}
      >
        <View style={styles.paywallBackdrop}>
          <View style={styles.paywallSheet}>
            <TouchableOpacity
              style={styles.paywallClose}
              onPress={() => setPaywallOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="paywall-close"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <PaywallCard />
          </View>
        </View>
      </Modal>
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
    gap: 8,
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    color: '#0A0B0E',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  paywallBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  paywallSheet: {
    gap: 10,
  },
  paywallClose: {
    alignSelf: 'flex-end',
  },
});

export const LOCKED_RATIONALE_TEASER =
  'AI rationale locked — upgrade to Pro to see why this trade was called.';

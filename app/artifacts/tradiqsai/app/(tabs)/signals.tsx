import React, { useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ManageSubscriptionCard, ProWindDownBanner } from '@/components/paywall';
import { PaywallModal } from '@/components/PaywallModal';
import SignalDetailModal from '@/components/SignalDetailModal';
import colors from '@/constants/colors';
import { useGetSignals, type Signal } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { executeSimulatedTrade } from '@/lib/tradeExecution';
import { useAuth } from '@/context/AuthContext';
import { Alert } from 'react-native';

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

function getConfidence(signal: Signal): string {
  return signal.confidence ?? '—';
}

function getRiskReward(signal: Signal): string {
  return signal.rr ?? '—';
}

function getConfluenceFactors(signal: Signal): string[] {
  const factors = (signal as Signal & { confluenceFactors?: unknown }).confluenceFactors;
  return Array.isArray(factors) ? factors.filter((factor): factor is string => typeof factor === 'string') : [];
}

function confidenceScore(signal: Signal): number {
  const value = Number.parseInt(String(getConfidence(signal)).replace('%', ''), 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
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
  highlighted,
  locked,
  onOpen,
  onTrade,
  onUpgrade,
}: {
  signal: Signal;
  highlighted: boolean;
  locked: boolean;
  onOpen: (signal: Signal) => void;
  onTrade: (signal: Signal) => void;
  onUpgrade: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(highlighted);
  const [highlightActive, setHighlightActive] = useState(highlighted);
  const [riskPercentage, setRiskPercentage] = useState<1 | 2 | 5>(2);
  const [executing, setExecuting] = useState(false);
  const { session } = useAuth();
  const isBuy = signal.direction === 'BUY';
  const dirColor = isBuy ? '#00F0FF' : '#E54B4B';
  const accent = signal.isPremium ? c.secondary : c.primary;
  const status = STATUS_STYLES[signal.status] ?? STATUS_STYLES.Active;
  useEffect(() => {
    if (!highlighted) return;
    setIsExpanded(true);
    setHighlightActive(true);
    const timeout = setTimeout(() => setHighlightActive(false), 3000);
    return () => clearTimeout(timeout);
  }, [highlighted]);

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: accent }, highlightActive && styles.highlightedCard]}
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

      <View style={styles.edgeRow}>
        <View style={styles.edgeMetric}>
          <Text style={styles.edgeLabel}>AI CONVICTION</Text>
          <Text style={styles.edgeValue}>{locked ? '•••' : getConfidence(signal)}</Text>
        </View>
        <View style={styles.edgeMetric}>
          <Text style={styles.edgeLabel}>RISK / REWARD</Text>
          <Text style={[styles.edgeValue, { color: c.secondary }]}>
            {locked ? '•••' : getRiskReward(signal)}
          </Text>
        </View>
      </View>

      {!locked && (
        <>
          <View style={styles.confidenceBlock}>
            <View style={styles.confidenceHeader}>
              <Text style={styles.edgeLabel}>AI CONFIDENCE</Text>
              <Text style={styles.confidenceValue}>{confidenceScore(signal)}%</Text>
            </View>
            <View style={styles.confidenceTrack}>
              <View style={[styles.confidenceFill, { width: `${confidenceScore(signal)}%`, backgroundColor: confidenceScore(signal) >= 85 ? '#00F0FF' : confidenceScore(signal) >= 70 ? '#FBBF24' : '#EF4444' }]} />
            </View>
          </View>
          <Pressable style={styles.analysisToggle} onPress={() => setIsExpanded((expanded) => !expanded)} accessibilityRole="button" accessibilityLabel="View AI Analysis">
            <Text style={styles.analysisToggleText}>View AI Analysis</Text>
            <Feather name="chevron-down" size={16} color={c.primary} style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }} />
          </Pressable>
          {isExpanded && (
            <View style={styles.analysisPanel}>
              <Text style={styles.analysisTitle}>TECHNICAL CONFLUENCE</Text>
              {getConfluenceFactors(signal).map((factor) => (
                <View key={factor} style={styles.factorRow}>
                  <Feather name="check-circle" size={14} color="#00F0FF" />
                  <Text style={styles.factorText}>{factor}</Text>
                </View>
              ))}
              <View style={styles.thesisBlock}>
                <Text style={styles.analysisTitle}>AI THESIS</Text>
                <Text style={styles.thesisText}>{signal.rationale || 'No thesis available for this signal.'}</Text>
              </View>
              <View style={styles.executionBlock}>
                <Text style={styles.executionTitle}>TRADE EXECUTION</Text>
                <Text style={styles.executionHint}>Allocate a fixed percentage of your $10,000 simulated account.</Text>
                <View style={styles.riskRow}>
                  {[1, 2, 5].map((risk) => (
                    <Pressable
                      key={risk}
                      onPress={() => setRiskPercentage(risk as 1 | 2 | 5)}
                      style={[styles.riskButton, riskPercentage === risk && styles.riskButtonActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.riskText, riskPercentage === risk && styles.riskTextActive]}>{risk}%</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.positionSize}>
                  Position Size: ${(10000 * (riskPercentage / 100)).toFixed(2)}
                </Text>
                <Pressable
                  style={[styles.executeButton, executing && styles.executeButtonDisabled]}
                  disabled={executing}
                  onPress={async () => {
                    if (!session?.user.id) {
                      Alert.alert('Sign in required', 'Sign in before executing a simulated trade.');
                      return;
                    }
                    setExecuting(true);
                    try {
                      await executeSimulatedTrade(session.user.id, signal, riskPercentage);
                      Alert.alert('Trade Executed', 'Trade Executed. Check Portfolio.');
                    } catch (error) {
                      Alert.alert('Execution failed', error instanceof Error ? error.message : 'Unable to execute trade.');
                    } finally {
                      setExecuting(false);
                    }
                  }}
                  testID={`execute-trade-${signal.id}`}
                >
                  <Text style={styles.executeButtonText}>{executing ? 'Executing…' : 'Execute Trade'}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}

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
  const { highlight_id } = useLocalSearchParams<{ highlight_id?: string | string[] }>();
  const highlightId = Array.isArray(highlight_id) ? highlight_id[0] : highlight_id;
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { data: signals, isLoading: signalsLoading, isError, refetch } = useGetSignals();
  const { isSubscribed, isLoading: subLoading, verificationPending } = useSubscription();
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [detailSignal, setDetailSignal] = useState<Signal | null>(null);

  const isLoading = signalsLoading || subLoading;

  const safeSignals = Array.isArray(signals) ? signals : [];
  const filtered = useMemo(
    () => safeSignals.filter((s) => s && matchesFilter(s, filter)),
    [safeSignals, filter],
  );

  const handleTrade = (signal: Signal) => {
    router.push({
      pathname: '/tradiqsai' as never,
      params: { symbol: signal.asset, direction: signal.direction },
    });
  };

  return (
    <ErrorBoundary>
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

      <View style={styles.performanceCard} testID="performance-summary">
        <View style={styles.performanceIntro}>
          <Text style={styles.performanceEyebrow}>SIGNAL DESK / PERFORMANCE</Text>
          <Text style={styles.performanceTitle}>Institutional edge, in real time.</Text>
        </View>
        <View style={styles.performanceMetrics}>
          <View style={styles.performanceMetric}>
            <Text style={styles.performanceValue}>82%</Text>
            <Text style={styles.performanceLabel}>OVERALL WIN RATE</Text>
          </View>
          <View style={styles.performanceDivider} />
          <View style={styles.performanceMetric}>
            <Text style={[styles.performanceValue, { color: c.primary }]}>{safeSignals.filter((s) => s?.status === 'Active').length || 3}</Text>
            <Text style={styles.performanceLabel}>ACTIVE SIGNALS</Text>
          </View>
        </View>
      </View>

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
              highlighted={item.id === highlightId}
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  highlightedCard: {
    borderWidth: 1,
    borderColor: '#00F0FF',
    shadowColor: '#00F0FF',
    shadowOpacity: 0.65,
    shadowRadius: 10,
    elevation: 5,
  },
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
  confidenceBlock: { gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  confidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confidenceValue: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' },
  confidenceTrack: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#252830' },
  confidenceFill: { height: '100%', borderRadius: 4 },
  analysisToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border },
  analysisToggleText: { color: c.primary, fontSize: 12, fontFamily: 'Inter_700Bold' },
  analysisPanel: { backgroundColor: '#0A0B0E', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 10 },
  analysisTitle: { color: '#6D727B', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factorText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  thesisBlock: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 5, marginTop: 3 },
  thesisText: { color: '#8A8D93', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  executionBlock: { backgroundColor: '#12141A', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 10, marginTop: 4 },
  executionTitle: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  executionHint: { color: '#6D727B', fontSize: 11, lineHeight: 16 },
  riskRow: { flexDirection: 'row', gap: 8 },
  riskButton: { flex: 1, borderWidth: 1, borderColor: '#30343D', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  riskButtonActive: { borderColor: '#00F0FF', backgroundColor: 'rgba(0,240,255,0.1)' },
  riskText: { color: '#8A8D93', fontSize: 13, fontFamily: 'Inter_700Bold' },
  riskTextActive: { color: '#00F0FF' },
  positionSize: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter_700Bold' },
  executeButton: { backgroundColor: '#00F0FF', borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  executeButtonDisabled: { opacity: 0.6 },
  executeButtonText: { color: '#0A0B0E', fontSize: 15, fontFamily: 'Inter_700Bold' },
  edgeRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
  },
  edgeMetric: {
    flex: 1,
    backgroundColor: 'rgba(0,240,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  edgeLabel: {
    color: c.mutedForeground,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.6,
  },
  edgeValue: {
    color: '#2ECA8B',
    fontSize: 16,
    marginTop: 3,
    fontFamily: 'Inter_700Bold',
  },
  performanceCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.25)',
    backgroundColor: '#11151A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  performanceIntro: {
    flex: 1,
    paddingRight: 10,
  },
  performanceEyebrow: {
    color: c.primary,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  performanceTitle: {
    color: c.foreground,
    fontSize: 13,
    marginTop: 5,
    fontFamily: 'Inter_700Bold',
  },
  performanceMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  performanceMetric: {
    alignItems: 'flex-end',
  },
  performanceValue: {
    color: '#2ECA8B',
    fontSize: 19,
    fontFamily: 'Inter_700Bold',
  },
  performanceLabel: {
    color: c.mutedForeground,
    fontSize: 8,
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
  },
  performanceDivider: {
    width: 1,
    height: 32,
    backgroundColor: c.border,
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

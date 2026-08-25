import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { customFetch } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';
import { PaywallModal } from '@/components/PaywallModal';
import { AutoPilotSettingsModal } from '@/components/AutoPilotSettingsModal';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import {
  CATEGORY_FILTERS,
  CATEGORY_META,
  STATUS_FILTERS,
  STATUS_META,
  categoryMatches,
  formatPrice,
  formatSignalTime,
  potentialLabel,
  realizedLabel,
  statusMatches,
  tradeNowUrl,
  type CategoryFilter,
  type SignalFeed,
  type SignalListItem,
  type SignalQuota,
  type StatusFilter,
} from '@/lib/signals';

const gold = '#FFD55A', cyan = '#00F0FF', green = '#28D68A', red = '#FF6576';

export default function SignalsScreen() {
  const router = useRouter();
  const { accessTier, isAdmin } = useSubscription();
  const [signals, setSignals] = useState<SignalListItem[]>([]);
  const [quota, setQuota] = useState<SignalQuota | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [paywall, setPaywall] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [autopilotLocked, setAutopilotLocked] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const premium = isAdmin || accessTier === 'pro' || accessTier === 'elite';

  const load = useCallback(async () => {
    setIsLoading(true);
    setFailed(false);
    try {
      const feed = await customFetch<SignalFeed>('/api/signals');
      setSignals(Array.isArray(feed?.signals) ? feed.signals : []);
      setQuota(feed?.quota ?? null);
    } catch {
      setSignals([]);
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      signals.filter(
        (signal) => statusMatches(signal, statusFilter) && categoryMatches(signal, categoryFilter),
      ),
    [signals, statusFilter, categoryFilter],
  );

  /**
   * Free-tier unlock: the server consumes one daily slot atomically and marks
   * the signal viewed so it stays readable after the quota is exhausted.
   */
  const unlock = useCallback(async (signal: SignalListItem) => {
    if (unlockingId) return;
    setUnlockingId(signal.id);
    try {
      const result = await customFetch<{ signal: SignalListItem; quota: SignalQuota }>(
        `/api/signals/${signal.id}/unlock`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      setSignals((prev) => prev.map((s) => (s.id === signal.id ? { ...result.signal } : s)));
      if (result.quota) setQuota(result.quota);
      router.push({ pathname: '/signals/[id]', params: { id: signal.id } });
    } catch (error) {
      if (error instanceof Error && /limit|402|upgrade/i.test(error.message)) {
        setPaywall(true);
      } else {
        setPaywall(true);
      }
    } finally {
      setUnlockingId(null);
    }
  }, [router, unlockingId]);

  const openDetails = useCallback(
    (signal: SignalListItem) => {
      if (signal.locked) {
        void unlock(signal);
        return;
      }
      router.push({ pathname: '/signals/[id]', params: { id: signal.id } });
    },
    [router, unlock],
  );

  const closeLocked = () => setAutopilotLocked(false);
  const showQuotaBanner = quota !== null && !quota.premium && !premium;

  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.kicker}>LIVE MARKET INTELLIGENCE</Text>
          <Text style={s.title}>Signal Desk</Text>
        </View>
        <TouchableOpacity onPress={() => void load()} accessibilityLabel="Refresh live signals">
          <Feather name="refresh-cw" size={20} color={cyan} />
        </TouchableOpacity>
      </View>

      {showQuotaBanner && (
        <View style={s.quotaBanner} testID="quota-banner">
          <View style={{ flex: 1 }}>
            <Text style={s.quotaTitle}>
              {quota.remaining} of {quota.limit} free signals remaining today
            </Text>
            <Text style={s.quotaSub}>Upgrade for unlimited signals</Text>
          </View>
          <TouchableOpacity
            style={s.quotaCta}
            testID="quota-upgrade"
            onPress={() => router.push('/paywall')}
            accessibilityLabel="Upgrade for unlimited signals"
          >
            <Feather name="zap" size={13} color="#101217" />
            <Text style={s.quotaCtaText}>UPGRADE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category filter — multi-asset desk */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {CATEGORY_FILTERS.map((category) => (
          <Pressable
            key={category}
            testID={`category-${category.toLowerCase()}`}
            onPress={() => setCategoryFilter(category)}
            style={[s.filter, s.categoryChip, categoryFilter === category && s.categoryChipActive]}
          >
            <Text style={[s.filterText, categoryFilter === category && s.filterTextActive]}>
              {category}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statusFilters}>
        {STATUS_FILTERS.map((status) => (
          <Pressable
            key={status}
            testID={`status-${status.toLowerCase()}`}
            onPress={() => setStatusFilter(status)}
            style={[s.filter, statusFilter === status && s.filterActive]}
          >
            <Text style={[s.filterText, statusFilter === status && s.filterTextActive]}>
              {status}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={cyan} />
          <Text style={s.muted}>Syncing live signals…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {failed ? (
            <TouchableOpacity onPress={() => void load()} style={s.empty}>
              <Feather name="wifi-off" size={25} color={gold} />
              <Text style={s.emptyTitle}>Live signal feed unavailable</Text>
              <Text style={s.muted}>Tap to retry the secure connection.</Text>
            </TouchableOpacity>
          ) : !visible.length ? (
            <View style={s.empty}>
              <Feather name="activity" size={28} color={gold} />
              <Text style={s.emptyTitle}>No Signals Here Yet</Text>
              <Text style={s.muted}>New institutional setups publish around the clock.</Text>
            </View>
          ) : (
            visible.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                unlocking={unlockingId === signal.id}
                onUnlock={() => void unlock(signal)}
                onDetails={() => openDetails(signal)}
              />
            ))
          )}
          <RiskDisclaimer />
        </ScrollView>
      )}

      {/* Floating AI action — AutoPilot. Do not move or restyle. */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => (premium ? setAutopilot(true) : setAutopilotLocked(true))}
        accessibilityLabel="Open AutoPilot"
      >
        <Feather name="cpu" size={25} color="#050505" />
        <Text style={s.fabText}>AI</Text>
      </TouchableOpacity>

      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
      <Modal visible={autopilotLocked} transparent animationType="fade" onRequestClose={closeLocked}>
        <Pressable style={s.overlay} onPress={closeLocked}>
          <Pressable style={s.sheet} onPress={(event) => event.stopPropagation()}>
            <TouchableOpacity style={s.close} onPress={closeLocked} accessibilityLabel="Close upgrade offer">
              <Feather name="x" size={22} color="#AAB2BF" />
            </TouchableOpacity>
            <View style={s.aiIcon}><Feather name="lock" size={28} color={gold} /></View>
            <Text style={s.sheetTitle}>AutoPilot is a Premium Feature</Text>
            <Text style={s.sheetBody}>Upgrade to run automated trading bots.</Text>
            <TouchableOpacity style={s.sheetButton} onPress={() => { closeLocked(); setPaywall(true); }}>
              <Text style={s.sheetButtonText}>UPGRADE NOW</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <AutoPilotSettingsModal visible={autopilot} onClose={() => setAutopilot(false)} />
    </View>
  );
}

function SignalCard({
  signal,
  unlocking,
  onUnlock,
  onDetails,
}: {
  signal: SignalListItem;
  unlocking: boolean;
  onUnlock: () => void;
  onDetails: () => void;
}) {
  const isBuy = signal.action === 'BUY';
  const actionColor = isBuy ? green : red;
  const market = CATEGORY_META[signal.assetClass] ?? CATEGORY_META.forex;
  const status = STATUS_META[signal.status] ?? STATUS_META.Active;

  return (
    <View style={s.card} testID={`signal-card-${signal.id}`}>
      {/* Header: ticker, direction, market, status */}
      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.pair}>{signal.pair}</Text>
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: actionColor }]}>
              <Feather name={isBuy ? 'trending-up' : 'trending-down'} size={10} color="#050505" />
              <Text style={s.badgeText}>{signal.action}</Text>
            </View>
            <View style={[s.badgeOutline, { borderColor: market.color }]}>
              <Text style={[s.badgeOutlineText, { color: market.color }]}>{market.label}</Text>
            </View>
            <View style={[s.badgeOutline, { borderColor: status.color }]}>
              <Text style={[s.badgeOutlineText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.rr}>{signal.riskReward} R:R</Text>
          <Text style={s.time}>{formatSignalTime(signal.timestamp)}</Text>
        </View>
      </View>

      {/* Body: entry / SL / TP checkpoints */}
      <View style={s.body}>
        <View style={s.priceRow}>
          <View style={s.priceCell}>
            <Text style={s.priceLabel}>ENTRY</Text>
            <Text style={s.priceValue}>{formatPrice(signal.entry, signal.pair)}</Text>
          </View>
          <View style={s.priceCell}>
            <Text style={[s.priceLabel, { color: red }]}>
              STOP LOSS{signal.breakeven && !signal.locked ? ' · BE' : ''}
            </Text>
            <Text style={[s.priceValue, { color: red }]}>
              {formatPrice(signal.stopLoss, signal.pair)}
            </Text>
          </View>
        </View>
        <View style={s.tpRow}>
          {signal.locked
            ? [1, 2, 3].map((id) => (
                <View key={id} style={[s.tpChip, s.tpChipLocked]}>
                  <Text style={s.tpChipTextLocked}>TP{id} ••••</Text>
                </View>
              ))
            : signal.takeProfits.map((tp) => (
                <View
                  key={tp.id}
                  style={[s.tpChip, tp.isHit ? s.tpChipHit : s.tpChipOpen]}
                  testID={`tp-chip-${signal.id}-${tp.id}`}
                >
                  {tp.isHit && <Feather name="check" size={9} color="#0A0B0E" />}
                  <Text style={tp.isHit ? s.tpChipTextHit : s.tpChipText}>
                    TP{tp.id} {tp.label}
                  </Text>
                </View>
              ))}
        </View>
        {signal.locked && (
          <TouchableOpacity
            style={s.lockOverlay}
            testID={`unlock-${signal.id}`}
            onPress={onUnlock}
            disabled={unlocking}
            accessibilityLabel={`Unlock ${signal.pair} with Premium`}
          >
            {unlocking ? (
              <ActivityIndicator color={gold} size="small" />
            ) : (
              <>
                <Feather name="lock" size={14} color={gold} />
                <Text style={s.lockText}>UNLOCK WITH PREMIUM</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Footer: broker action + details */}
      <View style={s.cardFooter}>
        <TouchableOpacity
          style={s.tradeButton}
          testID={`trade-${signal.id}`}
          onPress={() => void Linking.openURL(tradeNowUrl(signal))}
          accessibilityLabel={`Trade ${signal.pair} now`}
        >
          <Feather name="external-link" size={12} color="#050505" />
          <Text style={s.tradeButtonText}>TRADE NOW</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDetails}
          testID={`details-${signal.id}`}
          accessibilityLabel={`View ${signal.pair} signal details`}
          style={s.detailsButton}
        >
          <Text style={s.detailsText}>View Details</Text>
          <Feather name="chevron-right" size={14} color={cyan} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0B0E', paddingTop: 56 },
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFF', fontSize: 29, fontWeight: '900', marginTop: 4 },
  quotaBanner: {
    marginHorizontal: 20, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,213,90,.08)', borderWidth: 1, borderColor: 'rgba(255,213,90,.45)',
    borderRadius: 14, padding: 13,
  },
  quotaTitle: { color: gold, fontSize: 12, fontWeight: '900' },
  quotaSub: { color: '#9BA3AE', fontSize: 10, marginTop: 2 },
  quotaCta: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: gold,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    shadowColor: gold, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  quotaCtaText: { color: '#101217', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  filters: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 14 },
  statusFilters: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  filter: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10, backgroundColor: '#191C22' },
  categoryChip: { borderWidth: 1, borderColor: '#292E38' },
  categoryChipActive: { backgroundColor: gold, borderColor: gold },
  filterActive: { backgroundColor: cyan },
  filterText: { color: '#9BA3AE', fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: '#071014' },
  list: { padding: 20, paddingTop: 4, gap: 12, paddingBottom: 110 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#8A929E', fontSize: 12, textAlign: 'center' },
  empty: { marginTop: 60, alignItems: 'center', gap: 12, padding: 25 },
  emptyTitle: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  card: { backgroundColor: '#15181E', borderWidth: 1, borderColor: '#292E38', borderRadius: 16, padding: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  pair: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#050505', fontSize: 10, fontWeight: '900' },
  badgeOutline: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeOutlineText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  rr: { color: '#BBC3CE', fontSize: 11, fontWeight: '900' },
  time: { color: '#707785', fontSize: 9, marginTop: 5 },
  body: {
    position: 'relative', backgroundColor: '#0D1015', borderRadius: 11, marginTop: 15,
    padding: 13, gap: 10,
  },
  priceRow: { flexDirection: 'row', gap: 10 },
  priceCell: { flex: 1 },
  priceLabel: { color: '#8A929E', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  priceValue: { color: '#FFF', fontSize: 15, fontWeight: '900', marginTop: 3 },
  tpRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tpChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1,
  },
  tpChipOpen: { borderColor: 'rgba(40,214,138,.4)', backgroundColor: 'rgba(40,214,138,.07)' },
  tpChipHit: { borderColor: green, backgroundColor: green },
  tpChipLocked: { borderColor: '#292E38', backgroundColor: '#15181E' },
  tpChipText: { color: green, fontSize: 10, fontWeight: '900' },
  tpChipTextHit: { color: '#0A0B0E', fontSize: 10, fontWeight: '900' },
  tpChipTextLocked: { color: '#525A66', fontSize: 10, fontWeight: '900' },
  lockOverlay: {
    position: 'absolute', inset: 0, borderRadius: 11, backgroundColor: 'rgba(10,11,14,.82)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  lockText: { color: gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  tradeButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cyan,
    borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9,
  },
  tradeButtonText: { color: '#050505', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  detailsButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8 },
  detailsText: { color: cyan, fontSize: 12, fontWeight: '800' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 62, height: 62, borderRadius: 31, backgroundColor: '#00FFFF', alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#050505', fontSize: 10, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#171A20', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, alignItems: 'center', gap: 13 },
  close: { position: 'absolute', right: 16, top: 16, padding: 8 },
  aiIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,213,90,.12)' },
  sheetTitle: { color: '#FFF', fontSize: 21, fontWeight: '900' },
  sheetBody: { color: '#9BA3AE', fontSize: 13, textAlign: 'center' },
  sheetButton: { backgroundColor: gold, alignSelf: 'stretch', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  sheetButtonText: { color: '#101217', fontSize: 12, fontWeight: '900' },
});

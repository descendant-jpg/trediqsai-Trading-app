import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { customFetch } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';
import { PaywallModal } from '@/components/PaywallModal';
import { AutoPilotSettingsModal } from '@/components/AutoPilotSettingsModal';
import { AutoPilotPremiumModal } from '@/components/AutoPilotPremiumModal';
import { canAccessAutoPilot } from '@/lib/autopilotAccess';

type SignalStatus = 'Active' | 'Won' | 'Lost' | 'Pending';
type ProductionSignal = {
  id: string;
  pair: string;
  assetClass: string;
  action: string;
  status: SignalStatus;
  riskReward: number | string;
  entry: number | string;
  stopLoss: number | string;
  takeProfits: { price: number; hit: boolean }[] | string | unknown;
  timestamp: number | string;
  pips: number | string;
};

const gold = '#FFD55A';
const cyan = '#00F0FF';
const green = '#28D68A';
const red = '#FF6576';
const statuses: Array<SignalStatus | 'All'> = ['All', 'Active', 'Won', 'Lost', 'Pending'];

export const LOCKED_RATIONALE_TEASER =
  'AI rationale locked — upgrade to Premium to reveal the full signal setup.';

const price = (value: number | string) => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : '—';
};

const timestampMs = (timestamp: number | string) => {
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric)) return numeric < 1e11 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(timestamp));
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const parseTakeProfits = (
  value: ProductionSignal['takeProfits'],
): Array<{ price: number; hit: boolean }> => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (tp): tp is { price: number; hit: boolean } =>
              !!tp &&
              typeof tp === 'object' &&
              Number.isFinite(Number((tp as { price?: unknown }).price)),
          )
          .map((tp) => ({ price: Number(tp.price), hit: Boolean(tp.hit) }))
      : [];
  } catch {
    return [];
  }
};

export default function SignalsScreen() {
  const { accessTier, isAdmin = false } = useSubscription();
  const [signals, setSignals] = useState<ProductionSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<SignalStatus | 'All'>('All');
  const [paywall, setPaywall] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [autopilotLocked, setAutopilotLocked] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setFailed(false);
    try {
      const data = await customFetch<ProductionSignal[]>('/api/signals');
      setSignals(Array.isArray(data) ? data : []);
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
    () => signals.filter((signal) => filter === 'All' || signal.status === filter),
    [filter, signals],
  );
  const premium = accessTier === 'pro' || accessTier === 'elite';
  const autoPilotUnlocked = canAccessAutoPilot(accessTier, isAdmin);

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {statuses.map((status) => (
          <Pressable
            key={status}
            onPress={() => setFilter(status)}
            style={[s.filter, filter === status && s.filterActive]}
          >
            <Text style={[s.filterText, filter === status && s.filterTextActive]}>{status}</Text>
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
              <Text style={s.emptyTitle}>No Active Signals</Text>
              <Text style={s.muted}>Fresh institutional setups will appear here.</Text>
            </View>
          ) : (
            visible.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                locked={!premium}
                onUpgrade={() => setPaywall(true)}
              />
            ))
          )}
        </ScrollView>
      )}

      <TouchableOpacity
        style={s.fab}
        onPress={() => (autoPilotUnlocked ? setAutopilot(true) : setAutopilotLocked(true))}
        accessibilityLabel="Open AutoPilot"
      >
        <Feather name="cpu" size={25} color="#050505" />
        <Text style={s.fabText}>AI</Text>
      </TouchableOpacity>

      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
      <AutoPilotPremiumModal
        visible={autopilotLocked}
        onClose={() => setAutopilotLocked(false)}
        onUpgrade={() => {
          setAutopilotLocked(false);
          setPaywall(true);
        }}
      />
      <AutoPilotSettingsModal visible={autopilot} onClose={() => setAutopilot(false)} />
    </View>
  );
}

function SignalCard({
  signal,
  locked,
  onUpgrade,
}: {
  signal: ProductionSignal;
  locked: boolean;
  onUpgrade: () => void;
}) {
  const actionColor = /buy|long/i.test(signal.action) ? green : red;
  const statusColor =
    signal.status === 'Won'
      ? green
      : signal.status === 'Lost'
        ? red
        : signal.status === 'Active'
          ? cyan
          : '#AAB2BF';
  const safeTPs = parseTakeProfits(signal.takeProfits);
  const safeTime = timestampMs(signal.timestamp);
  const safePips = Number(signal.pips);

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View>
          <Text style={s.pair}>{signal.pair}</Text>
          <Text style={[s.action, { color: actionColor }]}>
            {signal.action} · {signal.assetClass.toUpperCase()}
          </Text>
        </View>
        <View style={s.headRight}>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: statusColor }]} />
            <Text style={s.status}>{signal.status.toUpperCase()}</Text>
          </View>
          <Text style={s.rr}>R:R {signal.riskReward}</Text>
        </View>
      </View>
      <View style={s.grid}>
        <Value label="ENTRY" value={price(signal.entry)} locked={locked} />
        <Value label="SL" value={price(signal.stopLoss)} locked={locked} />
        <View style={s.tpCol}>
          <Text style={s.label}>TAKE PROFITS</Text>
          {safeTPs.map((tp, index) => (
            <View key={`${tp.price}-${index}`} style={s.tp}>
              <Text style={[s.tpValue, locked && s.obscured]}>
                TP{index + 1} {price(tp.price)}
              </Text>
              {tp.hit && <Feather name="check-circle" size={13} color={green} />}
            </View>
          ))}
        </View>
        {locked ? (
          <TouchableOpacity style={s.lockOverlay} onPress={onUpgrade}>
            <Text style={s.lockIcon}>🔒</Text>
            <Text style={s.lockText}>UNLOCK WITH PREMIUM</Text>
            <Text style={s.lockSub}>Reveal exact entries, stops & targets</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.cardFooter}>
        <Text style={s.pips}>
          {safePips >= 0 ? '+' : ''}
          {Number.isFinite(safePips) ? safePips : '—'} PIPS
        </Text>
        <Text style={s.time}>{new Date(safeTime).toLocaleString()}</Text>
      </View>
    </View>
  );
}

function Value({ label, value, locked }: { label: string; value: string; locked: boolean }) {
  return (
    <View style={s.valueCol}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, locked && s.obscured]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0B0E', paddingTop: 56 },
  header: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: { color: cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFF', fontSize: 29, fontWeight: '900', marginTop: 4 },
  filters: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 0 },
  filter: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#191C22',
  },
  filterActive: { backgroundColor: cyan },
  filterText: { color: '#9BA3AE', fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: '#071014' },
  list: { padding: 20, paddingTop: 0, gap: 12, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#8A929E', fontSize: 12, textAlign: 'center' },
  empty: { marginTop: 60, alignItems: 'center', gap: 12, padding: 25 },
  emptyTitle: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  card: {
    backgroundColor: '#15181E',
    borderWidth: 1,
    borderColor: '#292E38',
    borderRadius: 16,
    padding: 16,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between' },
  pair: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  action: { fontSize: 11, fontWeight: '900', marginTop: 4 },
  headRight: { alignItems: 'flex-end', gap: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { color: '#BBC3CE', fontSize: 10, fontWeight: '900' },
  rr: { color: gold, fontSize: 11, fontWeight: '900' },
  grid: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: '#0D1015',
    borderRadius: 11,
    marginTop: 15,
    padding: 13,
    minHeight: 92,
  },
  valueCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#262B34',
    paddingRight: 8,
  },
  tpCol: { flex: 1.35, paddingLeft: 10 },
  label: { color: '#7C8490', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  value: { color: '#FFF', fontSize: 14, fontWeight: '800', marginTop: 8 },
  tp: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  tpValue: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  obscured: {
    color: 'transparent',
    textShadowColor: 'rgba(255,255,255,.8)',
    textShadowRadius: 7,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 11,
    backgroundColor: 'rgba(10,11,14,.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: { fontSize: 18 },
  lockText: { color: gold, fontSize: 11, fontWeight: '900', marginTop: 3 },
  lockSub: { color: '#D0D3D8', fontSize: 9, marginTop: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  pips: { color: green, fontSize: 10, fontWeight: '900' },
  time: { color: '#707785', fontSize: 9 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#00FFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 15,
    elevation: 10,
  },
  fabText: { color: '#050505', fontSize: 10, fontWeight: '900', marginTop: -2 },
});
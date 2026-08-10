import React from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';
import type { Signal } from '@workspace/api-client-react';

const c = colors.light;

const RISK_COLORS: Record<string, string> = {
  Low: '#2ECA8B',
  Medium: '#F5A623',
  High: '#E54B4B',
};

const STATUS_COLORS: Record<string, string> = {
  Active: '#00F0FF',
  Pending: '#F5A623',
  Won: '#2ECA8B',
  'SL Hit': '#E54B4B',
};

function PriceMap({ signal }: { signal: Signal }) {
  return (
    <View style={styles.priceMapCard}>
      <Text style={styles.blockTitle}>PRICE MAP</Text>
      <View style={styles.mapRow}>
        {/* SL marker */}
        <View style={styles.mapPoint}>
          <View style={[styles.mapMarker, { borderColor: '#E54B4B' }]}>
            <Feather name="x" size={10} color="#E54B4B" />
          </View>
          <Text style={[styles.mapLabel, { color: '#E54B4B' }]}>SL</Text>
          <Text style={styles.mapPrice}>{signal.stopLoss.price}</Text>
        </View>
        <View style={styles.mapLine} />
        {/* Entry */}
        <View style={styles.mapPoint}>
          <View style={[styles.mapDot, { backgroundColor: '#00F0FF' }]} />
          <Text style={[styles.mapLabel, { color: '#00F0FF' }]}>ENTRY</Text>
          <Text style={styles.mapPrice}>{signal.entry.price}</Text>
        </View>
        {signal.takeProfits.map((tp) => (
          <React.Fragment key={tp.id}>
            <View style={styles.mapLine} />
            <View style={styles.mapPoint}>
              <View
                style={[
                  styles.mapDot,
                  tp.isHit
                    ? { backgroundColor: '#2ECA8B' }
                    : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#2ECA8B' },
                ]}
              />
              <Text style={[styles.mapLabel, { color: '#2ECA8B' }]}>TP{tp.id}</Text>
              <Text style={styles.mapPrice}>{tp.price}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export default function SignalDetailModal({
  signal,
  onClose,
}: {
  signal: Signal | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!signal) return null;

  const isBuy = signal.direction === 'BUY';
  const dirColor = isBuy ? '#00F0FF' : '#E54B4B';
  const statusColor = STATUS_COLORS[signal.status] ?? '#00F0FF';
  const hits = signal.takeProfits.filter((tp) => tp.isHit).length;
  const progress = hits / signal.takeProfits.length;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 24 : insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="detail-close">
            <Feather name="chevron-left" size={24} color={c.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.asset}>{signal.asset}</Text>
              <View style={[styles.dirPill, { backgroundColor: dirColor }]}>
                <Text style={styles.dirText}>{signal.direction}</Text>
              </View>
            </View>
            <Text style={styles.headerSub}>
              {signal.time} · {signal.timeframe} · <Text style={{ color: statusColor }}>{signal.status}</Text>
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Quick stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>R:R</Text>
              <Text style={styles.statValue}>{signal.rr}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>CONFIDENCE</Text>
              <Text style={[styles.statValue, { color: '#00F0FF' }]}>{signal.confidence}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>RISK</Text>
              <View style={styles.riskRow}>
                <View style={[styles.riskDot, { backgroundColor: RISK_COLORS[signal.risk] }]} />
                <Text style={styles.statValue}>{signal.risk}</Text>
              </View>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>POTENTIAL</Text>
              <Text style={[styles.statValue, { color: '#2ECA8B' }]}>{signal.potentialPips}</Text>
            </View>
          </View>

          <PriceMap signal={signal} />

          {/* Entry & SL blocks */}
          <View style={styles.blockRow}>
            <View style={styles.squareCard}>
              <Text style={styles.blockTitle}>ENTRY TRIGGER</Text>
              <Text style={styles.blockPrice}>{signal.entry.price}</Text>
              <Text style={styles.blockMeta}>{signal.timeframe} confirmation</Text>
            </View>
            <View style={[styles.squareCard, { borderColor: 'rgba(229,75,75,0.35)' }]}>
              <Text style={[styles.blockTitle, { color: '#E54B4B' }]}>STOP LOSS</Text>
              <Text style={[styles.blockPrice, { color: '#E54B4B' }]}>
                {signal.stopLoss.isBreakeven ? 'BE' : signal.stopLoss.price}
              </Text>
              <Text style={styles.blockMeta}>
                {signal.stopLoss.isBreakeven ? 'Moved to breakeven' : `-${signal.stopLoss.pips} pips`}
              </Text>
            </View>
          </View>

          {/* Take profit list */}
          <View style={styles.tpCard}>
            <Text style={styles.blockTitle}>TAKE PROFITS</Text>
            {signal.takeProfits.map((tp) => (
              <View key={tp.id} style={styles.tpRow}>
                <View
                  style={[
                    styles.tpCircle,
                    tp.isHit
                      ? { backgroundColor: '#2ECA8B', borderColor: '#2ECA8B' }
                      : { borderColor: c.border },
                  ]}
                >
                  {tp.isHit && <Feather name="check" size={10} color="#0A0B0E" />}
                </View>
                <Text style={styles.tpName}>TP{tp.id}</Text>
                <Text style={styles.tpPips}>+{tp.pips}p</Text>
                <Text style={styles.tpPct}>{tp.percentage}</Text>
                <Text style={styles.tpPrice}>{tp.price}</Text>
              </View>
            ))}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>{hits}/{signal.takeProfits.length} targets hit</Text>
          </View>

          {/* Timeline */}
          <View style={styles.tpCard}>
            <Text style={styles.blockTitle}>TIMELINE</Text>
            <View style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, { backgroundColor: '#00F0FF' }]} />
                <View style={styles.timelineLine} />
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: signal.timeline.closed ? '#2ECA8B' : c.border },
                  ]}
                />
              </View>
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                <View>
                  <Text style={styles.timelineLabel}>Created</Text>
                  <Text style={styles.timelineValue}>{signal.timeline.created}</Text>
                </View>
                <View>
                  <Text style={styles.timelineLabel}>Closed</Text>
                  <Text style={styles.timelineValue}>{signal.timeline.closed ?? '—'}</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  asset: { color: c.foreground, fontSize: 20, fontFamily: 'Inter_700Bold' },
  dirPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  dirText: { color: '#0A0B0E', fontSize: 11, fontFamily: 'Inter_700Bold' },
  headerSub: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 12,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: {
    color: c.mutedForeground,
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.6,
  },
  statValue: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  priceMapCard: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 12,
  },
  mapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  mapPoint: { alignItems: 'center', gap: 3, minWidth: 44 },
  mapMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapDot: { width: 12, height: 12, borderRadius: 6, marginVertical: 3 },
  mapLine: { flex: 1, height: 1.5, backgroundColor: '#22252A', marginTop: 9 },
  mapLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  mapPrice: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_500Medium' },
  blockRow: { flexDirection: 'row', gap: 12 },
  squareCard: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.25)',
    padding: 14,
    justifyContent: 'space-between',
  },
  blockTitle: {
    color: '#00F0FF',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  blockPrice: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' },
  blockMeta: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' },
  tpCard: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 10,
  },
  tpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tpCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tpName: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_700Bold', width: 34 },
  tpPips: { color: '#2ECA8B', fontSize: 12, fontFamily: 'Inter_500Medium', width: 58 },
  tpPct: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  tpPrice: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_700Bold' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#22252A',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { height: '100%', backgroundColor: '#2ECA8B', borderRadius: 2 },
  progressText: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 76 },
  timelineRail: { alignItems: 'center', width: 14, paddingVertical: 3 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#22252A', marginVertical: 4 },
  timelineLabel: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_500Medium' },
  timelineValue: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' },
});

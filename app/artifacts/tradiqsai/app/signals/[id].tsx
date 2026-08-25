import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { customFetch } from '@workspace/api-client-react';
import { PaywallModal } from '@/components/PaywallModal';
import {
  CATEGORY_META,
  STATUS_META,
  formatPrice,
  formatSignalTime,
  potentialLabel,
  realizedLabel,
  type SignalListItem,
} from '@/lib/signals';

const gold = '#FFD55A', cyan = '#00F0FF', green = '#28D68A', red = '#FF6576';
const RISK_COLORS: Record<string, string> = { Low: green, Medium: '#F5A623', High: red };

/**
 * Institutional signal detail. Data comes from GET /api/signals/:id — the
 * server returns 402 for free users who have not unlocked the signal, so the
 * deep link from a push notification can never leak premium targets.
 */
export default function SignalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [signal, setSignal] = useState<SignalListItem | null>(null);
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setFailed(false);
    try {
      const data = await customFetch<SignalListItem>(`/api/signals/${id}`);
      setSignal(data);
      setLocked(false);
    } catch (error) {
      if (error instanceof Error && /402|locked|upgrade/i.test(error.message)) {
        setLocked(true);
      } else {
        setFailed(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Branded share snapshot: capture the off-screen share card to a PNG and
   * open the native share sheet. Falls back to a branded text card on web or
   * when the native snapshot pipeline is unavailable.
   */
  const shareSignal = useCallback(async () => {
    if (!signal || sharing) return;
    setSharing(true);
    const textCard =
      `⚡ TradiQs AI Signal\n${signal.pair} ${signal.action} @ ${formatPrice(signal.entry, signal.pair)}\n` +
      `R:R ${signal.riskReward} · Confidence ${signal.confidence ?? '—'}% · Target ${potentialLabel(signal)}\n` +
      `Open the TradiQs AI app for the live setup.`;
    try {
      if (Platform.OS !== 'web') {
        // Lazy requires: native modules are absent from the web bundle.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sharing = require('expo-sharing') as typeof import('expo-sharing');
        if (shareCardRef.current && (await Sharing.isAvailableAsync())) {
          const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share this signal' });
          return;
        }
      }
      await Share.share({ title: 'TradiQs AI Signal', message: textCard });
    } catch {
      try {
        await Share.share({ title: 'TradiQs AI Signal', message: textCard });
      } catch {
        // User dismissed or no share target — nothing to do.
      }
    } finally {
      setSharing(false);
    }
  }, [signal, sharing]);

  const isBuy = signal?.action === 'BUY';
  const dirColor = isBuy ? green : red;
  const market = signal ? CATEGORY_META[signal.assetClass] : null;
  const status = signal ? STATUS_META[signal.status] : null;
  const hits = signal?.takeProfits.filter((tp) => tp.isHit).length ?? 0;

  return (
    <SafeAreaView style={st.page} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back to Signal Desk" testID="detail-back">
          <Feather name="chevron-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerKicker}>SIGNAL INTELLIGENCE</Text>
          <View style={st.headerRow}>
            <Text style={st.headerTitle}>{signal?.pair ?? 'Signal'}</Text>
            {signal && (
              <View style={[st.dirPill, { backgroundColor: dirColor }]}>
                <Text style={st.dirPillText}>{signal.action}</Text>
              </View>
            )}
            {market && (
              <View style={[st.outlinePill, { borderColor: market.color }]}>
                <Text style={[st.outlinePillText, { color: market.color }]}>{market.label}</Text>
              </View>
            )}
            {status && (
              <View style={[st.outlinePill, { borderColor: status.color }]}>
                <Text style={[st.outlinePillText, { color: status.color }]}>{status.label}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={st.center}>
          <ActivityIndicator color={cyan} />
          <Text style={st.muted}>Loading signal intelligence…</Text>
        </View>
      ) : locked ? (
        <View style={st.center}>
          <View style={st.lockIcon}><Feather name="lock" size={30} color={gold} /></View>
          <Text style={st.lockTitle}>Premium Signal</Text>
          <Text style={st.muted}>Unlock this setup from the Signal Desk or upgrade for unlimited signals.</Text>
          <TouchableOpacity style={st.goldButton} onPress={() => setPaywall(true)} testID="detail-upgrade">
            <Text style={st.goldButtonText}>UPGRADE FOR UNLIMITED</Text>
          </TouchableOpacity>
          <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
        </View>
      ) : failed || !signal ? (
        <View style={st.center}>
          <Feather name="wifi-off" size={26} color={gold} />
          <Text style={st.lockTitle}>Signal unavailable</Text>
          <TouchableOpacity onPress={() => void load()} testID="detail-retry">
            <Text style={{ color: cyan, fontWeight: '800' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {/* Top stats bar */}
          <View style={st.statsBar} testID="detail-stats">
            <Stat label="R:R" value={signal.riskReward} />
            <Stat label="AI CONFIDENCE" value={`${signal.confidence ?? '—'}%`} accent={cyan} />
            <View style={st.statCell}>
              <Text style={st.statLabel}>RISK</Text>
              <View style={st.riskRow}>
                <View style={[st.riskDot, { backgroundColor: RISK_COLORS[signal.risk] ?? gold }]} />
                <Text style={st.statValue}>{signal.risk}</Text>
              </View>
            </View>
            <Stat label="POTENTIAL" value={potentialLabel(signal)} accent={green} />
          </View>

          {/* Price map */}
          <View style={st.card} testID="price-map">
            <Text style={st.cardTitle}>PRICE MAP</Text>
            <View style={st.mapRow}>
              <PriceMapPoint
                label="SL"
                price={formatPrice(signal.stopLoss, signal.pair)}
                color={red}
                marker="x"
                subLabel={signal.breakeven ? 'BREAK-EVEN' : undefined}
              />
              <View style={st.mapLine} />
              <PriceMapPoint label="ENTRY" price={formatPrice(signal.entry, signal.pair)} color={cyan} filled />
              {signal.takeProfits.map((tp) => (
                <React.Fragment key={tp.id}>
                  <View style={st.mapLine} />
                  <PriceMapPoint
                    label={`TP${tp.id}`}
                    price={formatPrice(tp.price, signal.pair)}
                    color={green}
                    filled={tp.isHit}
                  />
                </React.Fragment>
              ))}
            </View>
            {signal.breakeven && (
              <View style={st.beTag}>
                <Feather name="shield" size={10} color={green} />
                <Text style={st.beTagText}>STOP TRAILED TO BREAK-EVEN</Text>
              </View>
            )}
          </View>

          {/* Take-profit checkpoints */}
          <View style={st.card} testID="tp-checkpoints">
            <Text style={st.cardTitle}>TAKE PROFIT CHECKPOINTS</Text>
            {signal.takeProfits.map((tp, index) => (
              <View key={tp.id} style={st.tpRow} testID={`tp-row-${tp.id}`}>
                <View style={st.tpRail}>
                  <View style={[st.tpCircle, tp.isHit && st.tpCircleHit]}>
                    {tp.isHit && <Feather name="check" size={10} color="#0A0B0E" />}
                  </View>
                  {index < signal.takeProfits.length - 1 && <View style={st.tpLine} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={st.tpHeaderRow}>
                    <Text style={st.tpName}>TP{tp.id}</Text>
                    <Text style={[st.tpGain, { color: green }]}>{tp.label}</Text>
                    <Text style={st.tpPrice}>{formatPrice(tp.price, signal.pair)}</Text>
                  </View>
                  <Text style={st.tpStatus}>
                    {tp.isHit ? `Hit ${formatSignalTime(tp.hitAt ? Date.parse(tp.hitAt) : null)}` : 'Awaiting target'}
                  </Text>
                </View>
              </View>
            ))}
            <View style={st.progressTrack}>
              <View style={[st.progressFill, { width: `${(hits / Math.max(1, signal.takeProfits.length)) * 100}%` }]} />
            </View>
            <Text style={st.progressText}>
              {hits}/{signal.takeProfits.length} targets hit · Realized {realizedLabel(signal)}
            </Text>
          </View>

          {/* Collapsible AI analysis */}
          <View style={st.card}>
            <TouchableOpacity
              style={st.analysisHeader}
              onPress={() => setAnalysisOpen((open) => !open)}
              accessibilityLabel="Toggle AI analysis"
              testID="analysis-toggle"
            >
              <View style={st.analysisTitleRow}>
                <Feather name="cpu" size={13} color={cyan} />
                <Text style={st.cardTitle}>AI ORACLE ANALYSIS</Text>
              </View>
              <Feather name={analysisOpen ? 'chevron-up' : 'chevron-down'} size={16} color={cyan} />
            </TouchableOpacity>
            {analysisOpen && (
              <Text style={st.analysisBody} testID="analysis-body">
                {signal.analysis ?? 'Analysis is being generated for this setup.'}
              </Text>
            )}
          </View>

          {/* Trade timeline */}
          <View style={st.card} testID="timeline">
            <Text style={st.cardTitle}>TRADE TIMELINE</Text>
            <TimelineRow label="Signal created" value={formatSignalTime(signal.timestamp)} color={cyan} />
            <TimelineRow
              label={signal.status === 'Pending' ? 'Trigger pending' : 'Entry triggered'}
              value={signal.openedAt ? formatSignalTime(signal.openedAt) : '—'}
              color={gold}
            />
            <TimelineRow
              label={signal.status === 'Won' ? 'Target hit — closed' : signal.status === 'Lost' ? 'Stop hit — closed' : 'Close'}
              value={signal.closedAt ? formatSignalTime(signal.closedAt) : '—'}
              color={signal.status === 'Lost' ? red : green}
              last
            />
          </View>

          {/* Branded share action */}
          <TouchableOpacity
            style={st.shareButton}
            onPress={() => void shareSignal()}
            disabled={sharing}
            accessibilityLabel="Share this signal"
            testID="share-signal"
          >
            {sharing ? (
              <ActivityIndicator color="#050505" size="small" />
            ) : (
              <>
                <Feather name="share-2" size={15} color="#050505" />
                <Text style={st.shareButtonText}>SHARE SIGNAL</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Off-screen branded snapshot captured by the share action. */}
      {signal && (
        <View style={st.shareCardHost} pointerEvents="none">
          <View style={st.shareCard} ref={shareCardRef} collapsable={false}>
            <Text style={st.shareKicker}>TRADIQS AI · SIGNAL DESK</Text>
            <View style={st.shareRow}>
              <Text style={st.sharePair}>{signal.pair}</Text>
              <View style={[st.dirPill, { backgroundColor: dirColor }]}>
                <Text style={st.dirPillText}>{signal.action}</Text>
              </View>
            </View>
            <Text style={st.shareEntry}>ENTRY {formatPrice(signal.entry, signal.pair)}</Text>
            <View style={st.shareTpRow}>
              {signal.takeProfits.map((tp) => (
                <Text key={tp.id} style={st.shareTp}>TP{tp.id} {tp.label}</Text>
              ))}
            </View>
            <Text style={st.shareMeta}>
              R:R {signal.riskReward} · AI CONFIDENCE {signal.confidence ?? '—'}%
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={st.statCell}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.statValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

function PriceMapPoint({
  label,
  price,
  color,
  filled,
  marker,
  subLabel,
}: {
  label: string;
  price: string;
  color: string;
  filled?: boolean;
  marker?: 'x';
  subLabel?: string;
}) {
  return (
    <View style={st.mapPoint}>
      {marker === 'x' ? (
        <View style={[st.mapMarker, { borderColor: color }]}>
          <Feather name="x" size={10} color={color} />
        </View>
      ) : (
        <View
          style={[
            st.mapDot,
            filled ? { backgroundColor: color } : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: color },
          ]}
        />
      )}
      <Text style={[st.mapLabel, { color }]}>{label}</Text>
      <Text style={st.mapPrice}>{price}</Text>
      {subLabel ? <Text style={st.mapSubLabel}>{subLabel}</Text> : null}
    </View>
  );
}

function TimelineRow({ label, value, color, last }: { label: string; value: string; color: string; last?: boolean }) {
  return (
    <View style={st.timelineRow}>
      <View style={st.timelineRail}>
        <View style={[st.timelineDot, { backgroundColor: color }]} />
        {!last && <View style={st.timelineLine} />}
      </View>
      <View>
        <Text style={st.timelineLabel}>{label}</Text>
        <Text style={st.timelineValue}>{value}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0B0E' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  headerKicker: { color: cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3, flexWrap: 'wrap' },
  headerTitle: { color: '#FFF', fontSize: 21, fontWeight: '900' },
  dirPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  dirPillText: { color: '#0A0B0E', fontSize: 10, fontWeight: '900' },
  outlinePill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  outlinePillText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13, padding: 30 },
  muted: { color: '#8A929E', fontSize: 12, textAlign: 'center' },
  lockIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,213,90,.12)' },
  lockTitle: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  goldButton: { backgroundColor: gold, borderRadius: 11, paddingHorizontal: 22, paddingVertical: 13, marginTop: 6 },
  goldButtonText: { color: '#101217', fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  scroll: { paddingHorizontal: 16, paddingBottom: 42, gap: 12 },
  statsBar: {
    flexDirection: 'row', backgroundColor: '#16181D', borderRadius: 14,
    borderWidth: 1, borderColor: '#292E38', paddingVertical: 13,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { color: '#8A929E', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  statValue: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  card: { backgroundColor: '#16181D', borderRadius: 14, borderWidth: 1, borderColor: '#292E38', padding: 14, gap: 10 },
  cardTitle: { color: cyan, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  mapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  mapPoint: { alignItems: 'center', gap: 3, minWidth: 46 },
  mapMarker: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  mapDot: { width: 12, height: 12, borderRadius: 6, marginVertical: 3 },
  mapLine: { flex: 1, height: 1.5, backgroundColor: '#22252A', marginTop: 9 },
  mapLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  mapPrice: { color: '#8A929E', fontSize: 9, fontWeight: '600' },
  mapSubLabel: { color: green, fontSize: 7, fontWeight: '900', letterSpacing: 0.4, marginTop: 1 },
  beTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(40,214,138,.1)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5,
  },
  beTagText: { color: green, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  tpRow: { flexDirection: 'row', gap: 12 },
  tpRail: { alignItems: 'center', width: 16 },
  tpCircle: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#3A4049',
    alignItems: 'center', justifyContent: 'center',
  },
  tpCircleHit: { backgroundColor: green, borderColor: green },
  tpLine: { flex: 1, width: 2, backgroundColor: '#22252A', marginVertical: 3 },
  tpHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tpName: { color: '#FFF', fontSize: 13, fontWeight: '900', width: 34 },
  tpGain: { fontSize: 12, fontWeight: '800', flex: 1 },
  tpPrice: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  tpStatus: { color: '#8A929E', fontSize: 10, marginTop: 2, marginBottom: 8 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#22252A', overflow: 'hidden', marginTop: 2 },
  progressFill: { height: '100%', backgroundColor: green, borderRadius: 2 },
  progressText: { color: '#8A929E', fontSize: 10, fontWeight: '600' },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analysisTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  analysisBody: { color: '#C6CDD6', fontSize: 13, lineHeight: 20 },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 34 },
  timelineRail: { alignItems: 'center', width: 12, paddingTop: 3 },
  timelineDot: { width: 9, height: 9, borderRadius: 5 },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#22252A', marginTop: 3 },
  timelineLabel: { color: '#8A929E', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  timelineValue: { color: '#FFF', fontSize: 13, fontWeight: '700', marginTop: 1 },
  shareButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: cyan, borderRadius: 12, paddingVertical: 15, marginTop: 4,
  },
  shareButtonText: { color: '#050505', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  shareCardHost: { position: 'absolute', left: -10000, top: 0 },
  shareCard: {
    width: 360, backgroundColor: '#0A0B0E', borderRadius: 18, padding: 22, gap: 10,
    borderWidth: 1, borderColor: 'rgba(0,240,255,.35)',
  },
  shareKicker: { color: cyan, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sharePair: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  shareEntry: { color: '#C6CDD6', fontSize: 14, fontWeight: '700' },
  shareTpRow: { flexDirection: 'row', gap: 10 },
  shareTp: { color: green, fontSize: 12, fontWeight: '900' },
  shareMeta: { color: '#8A929E', fontSize: 11, fontWeight: '700', marginTop: 4 },
});

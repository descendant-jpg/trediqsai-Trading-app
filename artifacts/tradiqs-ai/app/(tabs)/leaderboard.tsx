import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';
import { useGetLeaderboard, type Trader } from '@workspace/api-client-react';

const c = colors.light;

type Period = 'today' | 'week' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'all', label: 'All time' },
];


const YOU: Trader = {
  id: 'you',
  rank: 12,
  name: 'You',
  handle: '@you',
  pnl: 1240,
  pnlPct: 1.2,
  winRate: 53,
  trades: 24,
  pro: false,
};

// Per-period variation applied to the base (weekly) sample data. Each entry
// scales P&L and trade counts and nudges ordering so rankings differ per period.
const PERIOD_ADJUST: Record<
  Period,
  { pnlScale: number; tradeScale: number; shuffle: number[]; youRank: number; youPnl: number; youPnlPct: number; youTrades: number }
> = {
  today: {
    pnlScale: 0.18,
    tradeScale: 0.12,
    shuffle: [2, 0, 4, 1, 3, 6, 5, 8, 7, 9],
    youRank: 8,
    youPnl: 310,
    youPnlPct: 0.3,
    youTrades: 4,
  },
  week: {
    pnlScale: 1,
    tradeScale: 1,
    shuffle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    youRank: 12,
    youPnl: 1240,
    youPnlPct: 1.2,
    youTrades: 24,
  },
  all: {
    pnlScale: 6.4,
    tradeScale: 9,
    shuffle: [1, 0, 3, 2, 4, 6, 5, 7, 9, 8],
    youRank: 27,
    youPnl: 4120,
    youPnlPct: 4.1,
    youTrades: 118,
  },
};

function tradersForPeriod(period: Period, base: Trader[]): Trader[] {
  const adj = PERIOD_ADJUST[period];
  return adj.shuffle
    .filter((srcIdx) => srcIdx < base.length)
    .map((srcIdx, i) => {
    const t = base[srcIdx];
    return {
      ...t,
      rank: i + 1,
      pnl: Math.round(t.pnl * adj.pnlScale),
      pnlPct: Number((t.pnlPct * adj.pnlScale).toFixed(1)),
      trades: Math.max(1, Math.round(t.trades * adj.tradeScale)),
    };
  });
}

function youForPeriod(period: Period): Trader {
  const adj = PERIOD_ADJUST[period];
  return { ...YOU, rank: adj.youRank, pnl: adj.youPnl, pnlPct: adj.youPnlPct, trades: adj.youTrades };
}

const MEDAL_COLORS: Record<number, string> = {
  1: '#FFD75E',
  2: '#C7CCD6',
  3: '#D0925B',
};

function formatPnl(v: number) {
  const sign = v >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(v).toLocaleString()}`;
}

function seededSeries(seed: string, points: number, finalPnl: number): number[] {
  // Deterministic pseudo-random walk ending at the trader's P&L.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
  const series: number[] = [0];
  for (let i = 1; i < points; i++) {
    const drift = finalPnl / points;
    const noise = (rand() - 0.5) * Math.max(Math.abs(finalPnl), 2000) * 0.25;
    series.push(series[i - 1] + drift + noise);
  }
  series[points - 1] = finalPnl;
  return series;
}
function TraderRow({
  trader,
  isYou,
  onPress,
}: {
  trader: Trader;
  isYou?: boolean;
  onPress?: (t: Trader) => void;
}) {
  const profit = trader.pnl >= 0;
  const pnlColor = profit ? c.success : c.destructive;
  const medal = MEDAL_COLORS[trader.rank];

  return (
    <Pressable
      onPress={() => onPress?.(trader)}
      style={({ pressed }) => [styles.row, isYou && styles.youRow, pressed && styles.rowPressed]}
    >
      <View style={styles.rankBox}>
        {medal ? (
          <Feather name="award" size={18} color={medal} />
        ) : (
          <Text style={styles.rankText}>{trader.rank}</Text>
        )}
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {trader.name
            .split(' ')
            .map((p) => p[0])
            .join('')}
        </Text>
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {trader.name}
          </Text>
          {isYou && (
            <View style={styles.youBadge}>
              <Text style={styles.youText}>YOU</Text>
            </View>
          )}
          {trader.pro && (
            <View style={styles.proBadge}>
              <Text style={styles.proText}>PRO</Text>
            </View>
          )}
        </View>
        <Text style={styles.handle}>
          {trader.handle} · {trader.winRate}% win · {trader.trades} trades
        </Text>
      </View>
      <View style={styles.pnlBox}>
        <Text style={[styles.pnl, { color: pnlColor }]}>{formatPnl(trader.pnl)}</Text>
        <Text style={[styles.pnlPct, { color: pnlColor }]}>
          {trader.pnlPct >= 0 ? '+' : ''}
          {trader.pnlPct.toFixed(1)}%
        </Text>
      </View>
    </Pressable>
  );
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const [period, setPeriod] = useState<Period>('week');
  const [selected, setSelected] = useState<Trader | null>(null);
  const { data: baseTraders, isLoading, isError, refetch } = useGetLeaderboard();

  const traders = useMemo(
    () => tradersForPeriod(period, baseTraders ?? []),
    [period, baseTraders],
  );
  const you = useMemo(() => youForPeriod(period), [period]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="award" size={20} color={c.secondary} />
        <Text style={styles.headerTitle}>Leaderboard</Text>
      </View>
      <View style={styles.segmented}>
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[styles.segment, active && styles.segmentActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={c.secondary} />
          <Text style={styles.stateText}>Loading leaderboard…</Text>
        </View>
      ) : isError ? (
        <View style={styles.stateBox}>
          <Feather name="alert-circle" size={24} color={c.destructive} />
          <Text style={styles.stateText}>Couldn't load the leaderboard.</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.youPinned}>
            <TraderRow trader={you} isYou onPress={setSelected} />
          </View>
          <FlatList
            data={traders}
            extraData={period}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TraderRow trader={item} onPress={setSelected} />}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
      <TraderDetailModal trader={selected} onClose={() => setSelected(null)} />
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
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: c.muted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: colors.radius,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: colors.radius - 3,
  },
  segmentActive: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.primary,
  },
  segmentText: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  segmentTextActive: {
    color: c.primary,
    fontFamily: 'Inter_700Bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: colors.radius,
    padding: 12,
  },
  youPinned: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  youRow: {
    borderColor: c.primary,
    backgroundColor: 'rgba(0,240,255,0.08)',
  },
  youBadge: {
    backgroundColor: 'rgba(0,240,255,0.15)',
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  youText: {
    color: c.primary,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  separator: {
    height: 8,
  },
  rankBox: {
    width: 28,
    alignItems: 'center',
  },
  rankText: {
    color: c.mutedForeground,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.muted,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: c.primary,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    flexShrink: 1,
  },
  proBadge: {
    backgroundColor: 'rgba(176,38,255,0.15)',
    borderWidth: 1,
    borderColor: c.secondary,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  proText: {
    color: c.secondary,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  handle: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  pnlBox: {
    alignItems: 'flex-end',
    gap: 2,
  },
  pnl: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  pnlPct: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
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
    borderColor: c.secondary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: c.secondary,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  rowPressed: {
    opacity: 0.7,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.muted,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarText: {
    color: c.primary,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  modalHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  modalName: {
    color: c.foreground,
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  closeBtn: {
    padding: 4,
  },
  modalPnlBlock: {
    marginTop: 20,
    gap: 2,
  },
  modalPnl: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  modalPnlPct: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 72,
    gap: 2,
    marginTop: 16,
  },
  sparkBarSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  sparkBar: {
    borderRadius: 2,
    opacity: 0.85,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: c.muted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: colors.radius,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: c.foreground,
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
});

function Sparkline({ trader }: { trader: Trader }) {
  const series = useMemo(() => seededSeries(trader.id, 24, trader.pnl), [trader]);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const color = trader.pnl >= 0 ? c.success : c.destructive;

  return (
    <View style={styles.sparkline}>
      {series.map((v, i) => {
        const hPct = 8 + ((v - min) / range) * 92;
        return (
          <View key={i} style={styles.sparkBarSlot}>
            <View style={[styles.sparkBar, { height: `${hPct}%`, backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

function TraderDetailModal({ trader, onClose }: { trader: Trader | null; onClose: () => void }) {
  if (!trader) return null;
  const profit = trader.pnl >= 0;
  const pnlColor = profit ? c.success : c.destructive;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalAvatar}>
              <Text style={styles.modalAvatarText}>
                {trader.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')}
              </Text>
            </View>
            <View style={styles.modalHeaderInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.modalName}>{trader.name}</Text>
                {trader.pro && (
                  <View style={styles.proBadge}>
                    <Text style={styles.proText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={styles.handle}>
                {trader.handle} · Rank #{trader.rank}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Feather name="x" size={20} color={c.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.modalPnlBlock}>
            <Text style={[styles.modalPnl, { color: pnlColor }]}>{formatPnl(trader.pnl)}</Text>
            <Text style={[styles.modalPnlPct, { color: pnlColor }]}>
              {trader.pnlPct >= 0 ? '+' : ''}
              {trader.pnlPct.toFixed(1)}% this week
            </Text>
          </View>

          <Sparkline trader={trader} />

          <View style={styles.statsRow}>
            <StatBox label="Win rate" value={`${trader.winRate}%`} color={c.primary} />
            <StatBox label="Trades" value={`${trader.trades}`} />
            <StatBox
              label="Avg P&L / trade"
              value={formatPnl(Math.round(trader.pnl / trader.trades))}
              color={pnlColor}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

import React from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

const c = colors.light;

type Trader = {
  id: string;
  rank: number;
  name: string;
  handle: string;
  pnl: number;
  pnlPct: number;
  winRate: number;
  trades: number;
  pro: boolean;
};

const TRADERS: Trader[] = [
  { id: 't1', rank: 1, name: 'Ava Chen', handle: '@quantava', pnl: 48230, pnlPct: 34.2, winRate: 71, trades: 182, pro: true },
  { id: 't2', rank: 2, name: 'Marcus Vale', handle: '@valestreet', pnl: 39115, pnlPct: 28.7, winRate: 66, trades: 240, pro: true },
  { id: 't3', rank: 3, name: 'Rin Takahashi', handle: '@rin_alpha', pnl: 31877, pnlPct: 24.1, winRate: 63, trades: 155, pro: false },
  { id: 't4', rank: 4, name: 'Sofia Marino', handle: '@sofitrades', pnl: 22409, pnlPct: 18.9, winRate: 61, trades: 199, pro: false },
  { id: 't5', rank: 5, name: 'Dev Patel', handle: '@devdelta', pnl: 17654, pnlPct: 15.2, winRate: 58, trades: 310, pro: true },
  { id: 't6', rank: 6, name: 'Lena Fischer', handle: '@lenafx', pnl: 12980, pnlPct: 11.6, winRate: 57, trades: 128, pro: false },
  { id: 't7', rank: 7, name: 'Omar Haddad', handle: '@omarhedge', pnl: 8412, pnlPct: 7.9, winRate: 54, trades: 176, pro: false },
  { id: 't8', rank: 8, name: 'Jules Beaumont', handle: '@julescap', pnl: 3305, pnlPct: 3.1, winRate: 52, trades: 90, pro: false },
  { id: 't9', rank: 9, name: 'Nikolai Petrov', handle: '@nikvol', pnl: -2148, pnlPct: -2.4, winRate: 47, trades: 205, pro: false },
  { id: 't10', rank: 10, name: 'Harper Singh', handle: '@harperswing', pnl: -6820, pnlPct: -6.8, winRate: 44, trades: 143, pro: false },
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

const MEDAL_COLORS: Record<number, string> = {
  1: '#FFD75E',
  2: '#C7CCD6',
  3: '#D0925B',
};

function formatPnl(v: number) {
  const sign = v >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(v).toLocaleString()}`;
}

function TraderRow({ trader, isYou }: { trader: Trader; isYou?: boolean }) {
  const profit = trader.pnl >= 0;
  const pnlColor = profit ? c.success : c.destructive;
  const medal = MEDAL_COLORS[trader.rank];

  return (
    <View style={[styles.row, isYou && styles.youRow]}>
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
    </View>
  );
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Feather name="award" size={20} color={c.secondary} />
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Text style={styles.headerSub}>This week</Text>
      </View>
      <View style={styles.youPinned}>
        <TraderRow trader={YOU} isYou />
      </View>
      <FlatList
        data={TRADERS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TraderRow trader={item} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
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
  headerSub: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginLeft: 'auto',
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
});

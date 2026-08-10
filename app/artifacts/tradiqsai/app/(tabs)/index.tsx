import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import {
  BalanceCard,
  BlownAccountCard,
  DrawdownBar,
  ExecutionButtons,
  PositionCard,
  TerminalHeader,
} from '@/components/trading';
import { useProfile } from '@/hooks/useProfile';
import { TradingChart } from '@/components/wagmi-chart';
import { LivePriceTicker } from '@/components/live-ticker';
import { ProWindDownBanner } from '@/components/paywall';
import { useLiveMarket } from '@/hooks/useLiveMarket';
import * as TradeService from '@/services/TradeService';
import { useTrading, type TradeResult } from '@/context/TradingContext';
import colors from '@/constants/colors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaywallModal } from '@/components/PaywallModal';
import { LatestInsightsModal } from '@/components/LatestInsightsModal';

const c = colors.light;

function formatMoney(n: number) {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function TradingFloorScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const params = useLocalSearchParams<{ symbol?: string; direction?: string }>();

  const signalSymbol =
    typeof params.symbol === 'string' && params.symbol ? params.symbol : undefined;
  const signalDirection =
    params.direction === 'BUY' || params.direction === 'SELL'
      ? params.direction
      : undefined;

  const {
    price,
    equity,
    position,
    unrealizedPnl,
    drawdownUsed,
    distanceToPayout,
    buy,
    sell,
  } = useTrading();
  const [message, setMessage] = useState<string | null>(null);
  const { livePrice, chartData, heartbeat, connected } = useLiveMarket();
  const { profile, refresh: refreshProfile } = useProfile();
  const isBlown = profile?.account_status === 'BLOWN';

  // Server-owned numbers for signed-in traders; local simulation otherwise.
  // Drawdown breach happens at 95% of the daily starting balance, so the
  // bar shows how much of that 5% buffer today's losses have consumed.
  // Payout target mirrors the simulated 4.5% profit goal.
  const displayBalance = profile ? profile.balance : equity;
  const displayDistanceToPayout = profile
    ? Math.max(0, +(profile.daily_starting_balance * 1.045 - profile.balance).toFixed(2))
    : distanceToPayout;
  const displayDrawdownUsed = profile
    ? Math.min(
        Math.max(
          (profile.daily_starting_balance - profile.balance) /
            (profile.daily_starting_balance * 0.05 || 1),
          0,
        ),
        1,
      )
    : drawdownUsed;
  const [executing, setExecuting] = useState(false);
  /** Supabase id of the currently open trade record, if it was recorded. */
  const openTradeIdRef = useRef<string | null>(null);

  /**
   * Runs the local simulated trade, then records it to Supabase via
   * TradeService. Opening inserts a row; closing updates it — the database
   * trigger computes the final P&L server-side. Buttons stay disabled until
   * the network call settles so spam-taps can't open duplicate trades.
   */
  const executeTrade = useCallback(
    async (side: 'BUY' | 'SELL', localAction: () => TradeResult) => {
      if (executing) return;
      if (isBlown) {
        setMessage('Account blown — trading is disabled.');
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        return;
      }
      setExecuting(true);
      const result = localAction();
      handleResult(result);
      try {
        // Skip recording opens until a valid live price has arrived.
        if (result.kind === 'opened' && livePrice > 0) {
          const record = await TradeService.openTrade('BTC/USD', side, livePrice);
          openTradeIdRef.current = record.id;
        } else if (result.kind === 'closed') {
          const tradeId = openTradeIdRef.current;
          openTradeIdRef.current = null;
          if (tradeId) {
            await TradeService.closeTrade(tradeId, livePrice);
            // The DB trigger just settled P&L into profiles.balance.
            refreshProfile();
          }
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        setMessage(
          reason === 'User not authenticated'
            ? 'Simulated only — sign in to record trades'
            : `Trade not recorded: ${reason}`,
        );
      } finally {
        setExecuting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [executing, livePrice, isBlown, refreshProfile],
  );

  const handleResult = useCallback((result: TradeResult) => {
    if (result.kind === 'blocked') {
      setMessage(result.reason);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else if (result.kind === 'closed') {
      const { pnl } = result.trade;
      setMessage(
        `Position closed: ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`,
      );
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          pnl >= 0
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
      }
    } else {
      setMessage(null);
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <TerminalHeader />
      <ProWindDownBanner />

      <View style={styles.content}>
        <View>
          <BalanceCard
            balance={formatMoney(displayBalance)}
            distanceToPayout={formatMoney(displayDistanceToPayout)}
            label={profile ? 'ACCOUNT BALANCE' : 'SIMULATED BALANCE'}
          />
          <DrawdownBar used={displayDrawdownUsed} />
        </View>

        <View>
          <LivePriceTicker
            livePrice={livePrice}
            heartbeat={heartbeat}
            connected={connected}
          />
          <TradingChart symbol={signalSymbol} data={chartData} />
        </View>

        <View style={styles.bottom}>
          {position ? (
            <PositionCard
              side={position.side}
              entryPrice={position.entryPrice}
              size={position.size}
              price={price}
              pnl={unrealizedPnl}
            />
          ) : (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>QQX INDEX</Text>
              <Text style={styles.priceValue}>{price.toFixed(2)}</Text>
            </View>
          )}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {isBlown ? <BlownAccountCard /> : null}
          <ExecutionButtons
            onBuy={() => executeTrade('BUY', buy)}
            onSell={() => executeTrade('SELL', sell)}
            disabled={executing || isBlown}
            buyLabel={position?.side === 'SHORT' ? 'BUY / CLOSE' : 'BUY'}
            sellLabel={position?.side === 'LONG' ? 'SELL / CLOSE' : 'SELL'}
            preselected={position ? undefined : signalDirection}
          />
        </View>
      </View>
    </View>
  );
}

type Session = { city: string; zone: string; openHour: number; closeHour: number };
const SESSIONS: Session[] = [
  { city: 'Sydney', zone: 'Australia/Sydney', openHour: 7, closeHour: 16 },
  { city: 'Tokyo', zone: 'Asia/Tokyo', openHour: 9, closeHour: 18 },
  { city: 'London', zone: 'Europe/London', openHour: 8, closeHour: 17 },
  { city: 'New York', zone: 'America/New_York', openHour: 8, closeHour: 17 },
];
const BIAS = [
  ['EUR/USD', 'BULLISH', '↑'],
  ['GBP/USD', 'NEUTRAL', '—'],
  ['BTC/USD', 'BULLISH', '↑'],
];
const ACTIONS: Array<{ label: string; icon: React.ComponentProps<typeof Feather>['name']; route: string }> = [
  { label: 'Competition', icon: 'award', route: '/leaderboard' },
  { label: 'Calendar', icon: 'calendar', route: '/economic-calendar' },
  { label: 'VIP Signals', icon: 'star', route: '/vip-signals' },
  { label: 'Shop', icon: 'shopping-bag', route: '/shop' },
  { label: 'Game', icon: 'target', route: '/trading-arcade' },
  { label: 'AI Signals', icon: 'zap', route: '/signals' },
  { label: 'Trade Journal', icon: 'book-open', route: '/trade-journal' },
  { label: 'Community', icon: 'users', route: '/community' },
];
const FEATURED_MARKETS = [
  ['USOIL', 'BUY', '78.50'],
  ['BTC/USD', 'BUY', '96,210'],
  ['EUR/USD', 'SELL', '1.0850'],
  ['NVDA', 'BUY', '128.40'],
] as const;

function sessionState(session: Session, now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: session.zone, hour: 'numeric', hourCycle: 'h23' })
      .format(now),
  );
  return hour >= session.openHour && hour < session.closeHour;
}

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Institutional market overview with local, deterministic dashboard data. */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const { profile } = useProfile();
  const topInset = Platform.OS === 'web' ? 38 : insets.top + 10;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const localHour = now.getHours();
  const sessionStates = useMemo(() => SESSIONS.map((session) => ({
    ...session,
    open: sessionState(session, now),
  })), [now]);

  return (
    <View style={styles.homeContainer}>
      <ScrollView
        contentContainerStyle={[styles.homeContent, { paddingTop: topInset, paddingBottom: 115 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.homeHeader}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/quotes' as never)}
            accessibilityRole="button"
            accessibilityLabel="Market quotes"
            accessibilityHint="Open market quotes"
          >
            <Feather name="sun" size={19} color={c.primary} />
          </TouchableOpacity>
          <Text style={styles.homeTitle}>TradiQs AI</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/notifications' as never)}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            accessibilityHint="Open notifications"
          >
            <Feather name="bell" size={19} color={c.foreground} />
            <View style={styles.unreadBadge}><Text style={styles.unreadText}>3</Text></View>
          </TouchableOpacity>
        </View>

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>{greetingForHour(localHour)}, Trader</Text>
            <Text style={styles.greetingSub}>Your institutional edge starts here.</Text>
          </View>
          <View style={styles.online}><View style={styles.onlineDot} /><Text style={styles.onlineText}>Online</Text></View>
        </View>

        <Text style={styles.sectionLabel}>GLOBAL MARKET SESSIONS</Text>
        <View style={styles.sessionTicker}>
          {sessionStates.map((session) => (
            <Pressable
              key={session.city}
              style={styles.session}
              onPress={() => router.push('/session-intelligence' as never)}
              accessibilityRole="button"
              accessibilityLabel={`${session.city} market session`}
              accessibilityHint="Opens session intelligence"
              accessibilityState={{ disabled: false }}
            >
              <View style={[styles.sessionDot, { backgroundColor: session.open ? c.success : c.mutedForeground }]} />
              <Text style={styles.sessionCity}>{session.city}</Text>
              <Text style={[styles.sessionState, { color: session.open ? c.success : c.mutedForeground }]}>
                {session.open ? 'OPEN' : 'CLOSED'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.widgets}>
          <View style={[styles.widget, styles.fearWidget]}>
            <Text style={styles.sectionLabel}>FEAR & GREED</Text>
            <View
              style={styles.dial}
              accessible
              accessibilityRole="text"
              accessibilityLabel="Fear and Greed index: 68, Greed. Local sample indicator."
            >
              <Text style={styles.dialValue}>68</Text><Text style={styles.dialCaption}>GREED</Text>
            </View>
            <Text style={styles.sampleLabel}>Local sample indicator</Text>
          </View>
          <View style={[styles.widget, styles.biasWidget]}>
            <Text style={styles.sectionLabel}>MULTI-TF BIAS</Text>
            {BIAS.map(([pair, bias, trend]) => (
              <View key={pair} style={styles.biasRow}>
                <Text style={styles.pair}>{pair}</Text>
                <Text style={[styles.bias, { color: bias === 'BULLISH' ? c.success : c.mutedForeground }]}>{trend} {bias}</Text>
              </View>
            ))}
            <Text style={styles.sampleLabel}>Deterministic sample</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.actionGrid}>
          {ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                style={styles.actionTile}
                onPress={() => router.push(action.route as never)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={`Open ${action.label}`}
              >
              <Feather name={action.icon} size={20} color={c.primary} />
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.featuredMarkets}>
          {FEATURED_MARKETS.map(([asset, direction, entry]) => (
            <Pressable key={asset} style={styles.marketCard} onPress={() => router.push('/signals' as never)} accessibilityRole="button" accessibilityLabel={`${asset} ${direction} signal, entry ${entry}`} accessibilityHint="Open AI Signals">
              <View style={styles.marketMain}><Text style={styles.marketAsset}>{asset}</Text><Text style={[styles.direction, direction === 'SELL' && styles.sellDirection]}>{direction}</Text><Text style={styles.entry}>ENTRY {entry}</Text></View>
              <Text style={styles.live}>• LIVE  ›</Text>
            </Pressable>
          ))}
        </View>

        <TouchableOpacity style={styles.insightsBanner} onPress={() => setInsightsOpen(true)} accessibilityRole="button" accessibilityLabel="Latest Insights" accessibilityHint="Read free strategies and market analysis">
          <View style={styles.insightsIcon}><Feather name="book-open" size={19} color={c.primary} /></View>
          <View style={styles.insightsCopy}><Text style={styles.insightsTitle}>Latest Insights</Text><Text style={styles.insightsSub}>Free strategies, AI signal reviews & market analysis</Text></View>
          <Feather name="chevron-right" size={19} color={c.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.proBanner}
          onPress={() => setPaywallOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Go Pro. Trade with more edge."
          accessibilityHint="Opens premium subscription options"
        >
          <View style={styles.proIcon}><Feather name="zap" size={22} color={c.secondary} /></View>
          <View style={styles.proTextWrap}><Text style={styles.proTitle}>Go Pro. Trade with more edge.</Text><Text style={styles.proSub}>Premium signals, AI insights & more</Text></View>
          <Feather name="chevron-right" size={20} color={c.secondary} />
        </TouchableOpacity>

        <View style={styles.riskCard}>
          <View style={styles.riskHeader}><Text style={styles.riskIcon}>⚠</Text><Text style={styles.riskTitle}>RISK DISCLAIMER</Text></View>
          <Text style={styles.riskDisclaimer}>
          Trading involves substantial risk of loss. Past performance does not guarantee future results. This content is for educational and informational purposes only and does not constitute financial advice. Always do your own research.
          </Text>
        </View>
      </ScrollView>
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
      <LatestInsightsModal visible={insightsOpen} onClose={() => setInsightsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  bottom: {
    gap: 10,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  priceLabel: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
  },
  priceValue: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  message: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  homeContainer: { flex: 1, backgroundColor: c.background },
  homeContent: { paddingHorizontal: 16, gap: 16 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  homeTitle: { color: c.foreground, fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: .3 },
  unreadBadge: { position: 'absolute', top: -3, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.destructive, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.background },
  unreadText: { color: c.destructiveForeground, fontSize: 9, fontFamily: 'Inter_700Bold' },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  greeting: { color: c.foreground, fontSize: 21, fontFamily: 'Inter_700Bold' },
  greetingSub: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  online: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(46,202,139,0.10)' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
  onlineText: { color: c.success, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  sectionLabel: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.15 },
  sessionTicker: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: colors.radius, flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
  session: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 6 },
  sessionDot: { width: 7, height: 7, borderRadius: 4 },
  sessionCity: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold', flex: 1 },
  sessionState: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  widgets: { flexDirection: 'row', gap: 10 },
  widget: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: colors.radius, padding: 13, minHeight: 150 },
  fearWidget: { flex: .85 }, biasWidget: { flex: 1.35 },
  dial: { alignSelf: 'center', width: 92, height: 62, marginTop: 12, borderTopWidth: 8, borderLeftWidth: 8, borderRightWidth: 8, borderColor: c.success, borderTopLeftRadius: 52, borderTopRightRadius: 52, alignItems: 'center', justifyContent: 'flex-end' },
  dialValue: { color: c.foreground, fontSize: 23, fontFamily: 'Inter_700Bold' },
  dialCaption: { color: c.success, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: .7 },
  sampleLabel: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 'auto' },
  biasRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.border },
  pair: { color: c.foreground, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  bias: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  actionTile: { width: '22%', minHeight: 74, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 8, justifyContent: 'space-between' },
  actionText: { color: c.foreground, fontSize: 9, fontFamily: 'Inter_600SemiBold', lineHeight: 12 },
  featuredMarkets: { gap: 9 },
  marketCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 13 },
  marketMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  marketAsset: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold', minWidth: 67 },
  direction: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', backgroundColor: 'rgba(0,240,255,.12)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 },
  sellDirection: { color: c.destructive, backgroundColor: 'rgba(229,75,75,.12)' },
  entry: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  live: { color: c.success, fontSize: 10, fontFamily: 'Inter_700Bold' },
  insightsBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 13 },
  insightsIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,240,255,.1)', alignItems: 'center', justifyContent: 'center' },
  insightsCopy: { flex: 1 }, insightsTitle: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }, insightsSub: { color: c.mutedForeground, fontSize: 10, marginTop: 3 },
  proBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(176,38,255,0.10)', borderWidth: 1, borderColor: 'rgba(176,38,255,0.5)', borderRadius: colors.radius, padding: 14 },
  proIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(176,38,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  proTextWrap: { flex: 1 }, proTitle: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }, proSub: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  riskCard: { backgroundColor: c.card, borderWidth: 1, borderColor: '#332200', borderRadius: 12, padding: 14, gap: 8 },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 }, riskIcon: { color: '#FFB020', fontSize: 16 }, riskTitle: { color: '#FFB020', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  riskDisclaimer: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 15 },
});

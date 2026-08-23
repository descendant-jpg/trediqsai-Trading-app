import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaywallModal } from '@/components/PaywallModal';
import { LatestInsightsModal } from '@/components/LatestInsightsModal';
import { MultiTFAnalysisModal } from '@/components/MultiTFAnalysisModal';
import { ErrorBoundary as WidgetErrorBoundary } from '@/components/ErrorBoundary';
import type { ErrorFallbackProps } from '@/components/ErrorFallback';
import * as ImagePicker from 'expo-image-picker';

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
const STOCK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'QQQ'] as const;
type Ticker = { symbol: string; price: number; changePercent: number };
type TwelveDataQuote = {
  symbol?: string;
  close?: string | number;
  previous_close?: string | number;
  percent_change?: string | number;
};
type TwelveDataResponse = {
  status?: string;
  code?: number | string;
  message?: string;
  [symbol: string]: TwelveDataQuote | string | number | undefined;
};

function isTicker(value: unknown): value is Ticker {
  if (!value || typeof value !== 'object') return false;
  const ticker = value as Partial<Ticker>;
  return typeof ticker.symbol === 'string'
    && typeof ticker.price === 'number'
    && Number.isFinite(ticker.price)
    && typeof ticker.changePercent === 'number'
    && Number.isFinite(ticker.changePercent);
}

function HomeWidgetFallback({ resetError }: ErrorFallbackProps) {
  return (
    <View style={styles.widgetFallback}>
      <Text style={styles.widgetFallbackText}>This dashboard panel is temporarily unavailable.</Text>
      <Pressable onPress={resetError} accessibilityRole="button" accessibilityLabel="Retry dashboard panel">
        <Text style={styles.widgetFallbackRetry}>RETRY</Text>
      </Pressable>
    </View>
  );
}

function sessionState(session: Session, now: Date) {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: session.zone, hour: 'numeric', hourCycle: 'h23' })
        .format(now),
    );
    return Number.isFinite(hour) && hour >= session.openHour && hour < session.closeHour;
  } catch (error) {
    console.warn(`Market session time unavailable for ${session.city}.`, error);
    return false;
  }
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
  const [isHomeFocused, setIsHomeFocused] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [analysisSymbol, setAnalysisSymbol] = useState<string | null>(null);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [tickerLoading, setTickerLoading] = useState(true);
  const [primaryTickerWidth, setPrimaryTickerWidth] = useState(0);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const { profile } = useProfile();
  const topInset = Platform.OS === 'web' ? 38 : (insets?.top ?? 0) + 10;
  const bottomInset = insets?.bottom ?? 0;
  const liveTickers = useMemo(() => tickers.filter(isTicker), [tickers]);

  useFocusEffect(
    useCallback(() => {
      setIsHomeFocused(true);
      return () => setIsHomeFocused(false);
    }, []),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      try { setNow(new Date()); } catch { /* keep the last valid timestamp */ }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isHomeFocused) return;
    let active = true;

    const loadTickers = async () => {
      try {
        const url = `https://api.twelvedata.com/quote?symbol=AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,QQQ&apikey=${process.env.EXPO_PUBLIC_STOCK_API_KEY || ''}`;
        const response = await fetch(url);
        const rawText = await response.text();

        if (!url.includes('apikey=') || url.endsWith('apikey=')) {
          throw new Error('Env Var Failed: API Key is undefined in the bundle.');
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${rawText.substring(0, 100)}`);
        }

        const parsedJson = JSON.parse(rawText) as TwelveDataResponse;
        if (parsedJson.status === 'error' || parsedJson.code) {
          throw new Error(parsedJson.message || 'Twelve Data API blocked the request.');
        }

        const dataArray = Object.values(parsedJson).filter(
          (item): item is TwelveDataQuote => typeof item === 'object' && item !== null && typeof item.symbol === 'string',
        );
        const quotesBySymbol = new Map<string, { price: number; changePercent: number }>();
        for (const quote of dataArray) {
          if (!quote.symbol) continue;
          const rawPrice = quote?.close
            ? Number.parseFloat(String(quote.close))
            : quote?.previous_close
              ? Number.parseFloat(String(quote.previous_close))
              : 0;
          const rawChange = quote?.percent_change
            ? Number.parseFloat(String(quote.percent_change))
            : 0;
          const price = Number.isFinite(rawPrice) ? rawPrice : 0;
          const changePercent = Number.isFinite(rawChange) ? rawChange : 0;
          quotesBySymbol.set(quote.symbol, { price, changePercent });
        }
        const updatedTickers = STOCK_SYMBOLS.flatMap((symbol) => {
          const quote = quotesBySymbol.get(symbol);
          return quote
            ? [{ symbol, price: quote.price, changePercent: quote.changePercent }]
            : [];
        });
        if (updatedTickers.length === 0) {
          throw new Error('Twelve Data returned no usable quotes.');
        }
        if (active) setTickers(updatedTickers);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Market ticker refresh failed.', message);
      } finally {
        if (active) setTickerLoading(false);
      }
    };
    loadTickers();
    const timer = setInterval(loadTickers, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [isHomeFocused]);

  useEffect(() => {
    if (!isHomeFocused || !primaryTickerWidth) {
      translateX.stopAnimation();
      translateX.setValue(0);
      return;
    }

    translateX.stopAnimation();
    translateX.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: -primaryTickerWidth,
          duration: Math.max(18_000, primaryTickerWidth * 28),
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      translateX.stopAnimation();
      translateX.setValue(0);
    };
  }, [isHomeFocused, primaryTickerWidth, translateX]);

  const openGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setPickerMessage('Photo access is required to analyze a chart.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const uri = result.assets?.[0]?.uri;
      if (!result.canceled && uri) {
        router.push({ pathname: '/ai-analysis', params: { imageUri: uri } });
      }
    } catch {
      setPickerMessage('Chart image access is unavailable right now.');
    }
  };
  const openCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setPickerMessage('Camera access is required to analyze a chart.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      const uri = result.assets?.[0]?.uri;
      if (!result.canceled && uri) {
        router.push({ pathname: '/ai-analysis', params: { imageUri: uri } });
      }
    } catch {
      setPickerMessage('Camera access is unavailable right now.');
    }
  };

  const localHour = now.getHours();
  const sessionStates = useMemo(() => SESSIONS.map((session) => ({
    ...session,
    open: sessionState(session, now),
  })), [now]);

  return (
    <View style={styles.homeContainer}>
      <ScrollView
        contentContainerStyle={[styles.homeContent, { paddingTop: topInset, paddingBottom: 115 + bottomInset }]}
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
           <View style={styles.titleStatus}><Text style={styles.homeTitle}>TradiQs AI</Text><View style={styles.online}><View style={styles.onlineDot} /><Text style={styles.onlineText}>Online</Text></View></View>
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

         <View style={styles.tickerViewport} testID="stock-marquee">
           {tickerLoading ? (
             <View style={styles.tickerStatus} accessibilityRole="progressbar" accessibilityLabel="Loading live market data">
               <Text style={styles.tickerStatusText}>Loading live market data…</Text>
             </View>
           ) : liveTickers.length > 0 ? (
            <Animated.View style={[styles.tickerRow, { transform: [{ translateX }] }]}>
               {[0, 1].map((copy) => (
                 <View
                   key={`ticker-copy-${copy}`}
                   style={styles.tickerCopy}
                   onLayout={copy === 0 ? (event) => setPrimaryTickerWidth(event.nativeEvent.layout.width) : undefined}
                 >
                   {liveTickers.map((ticker) => {
                    const rawPrice = ticker?.price ? Number.parseFloat(String(ticker.price)) : 0;
                    const price = Number.isFinite(rawPrice) ? rawPrice.toFixed(2) : '0.00';
                    const rawChange = ticker?.changePercent ? Number.parseFloat(String(ticker.changePercent)) : 0;
                    const change = Number.isFinite(rawChange) ? rawChange.toFixed(2) : '0.00';
                    const numericChange = Number.parseFloat(change);
                    const isPositive = numericChange > 0;
                    const isNegative = numericChange < 0;
                     const changeColor = isPositive ? '#00FF00' : isNegative ? '#FF0000' : c.mutedForeground;
                    const formattedPrice = Number.parseFloat(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return <View key={`${ticker.symbol}-${copy}`} style={styles.tickerPill}><Text style={styles.tickerSymbol}>{ticker?.symbol || '—'}</Text><Text style={styles.tickerPrice}>${formattedPrice}</Text><Text style={[styles.tickerChange, { color: changeColor }]}>{`${isPositive ? '+' : ''}${change}%`}</Text></View>;
                   })}
                 </View>
               ))}
             </Animated.View>
           ) : (
             <View style={styles.tickerStatus}>
               <Text style={styles.tickerStatusText}>Live market data is temporarily unavailable.</Text>
             </View>
           )}
         </View>

         <Text style={styles.sectionLabel}>ANALYZE CHART WITH AI</Text>
         <View style={styles.visionRow}>
            <Pressable style={styles.visionCard} onPress={() => router.push('/live-chart' as never)}><Feather name="activity" size={19} color={c.primary} /><Text style={styles.visionTitle}>Live Chart</Text></Pressable>
            <Pressable style={styles.visionCard} onPress={openCamera}><Feather name="camera" size={19} color={c.secondary} /><Text style={styles.visionTitle}>Camera</Text></Pressable>
            <Pressable style={styles.visionCard} onPress={openGallery}><Feather name="image" size={19} color={c.success} /><Text style={styles.visionTitle}>Gallery</Text></Pressable>
         </View>
         {pickerMessage ? <Pressable onPress={() => setPickerMessage(null)}><Text style={styles.pickerMessage}>{pickerMessage}</Text></Pressable> : null}

        <Text style={styles.sectionLabel}>GLOBAL MARKET SESSIONS</Text>
        <View style={styles.sessionTicker}>
          {(sessionStates ?? []).map((session) => (
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
            <View style={styles.biasHeader}><Text style={styles.sectionLabel}>MULTI-TF BIAS</Text><Pressable onPress={() => setAnalysisSymbol('BTC/USD')} accessibilityRole="button" accessibilityLabel="Open full multi-timeframe analysis"><Text style={styles.fullAnalysis}>Full Analysis →</Text></Pressable></View>
            {(BIAS ?? []).map(([pair, bias, trend]) => (
              <Pressable key={pair} style={styles.biasRow} onPress={() => setAnalysisSymbol(pair)} accessibilityRole="button" accessibilityLabel={`Open multi-timeframe analysis for ${pair}`}>
                <Text style={styles.pair}>{pair}</Text>
                <Text style={[styles.bias, { color: bias === 'BULLISH' ? c.success : c.mutedForeground }]}>{trend} {bias}</Text>
              </Pressable>
            ))}
            <Text style={styles.sampleLabel}>Deterministic sample</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.actionGrid}>
          {(ACTIONS ?? []).map((action) => (
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
          {(FEATURED_MARKETS ?? []).map(([asset, direction, entry]) => (
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

        <RiskDisclaimer />
      </ScrollView>
      <WidgetErrorBoundary
        FallbackComponent={HomeWidgetFallback}
        onError={(error) => console.warn('Paywall widget failed to render.', error)}
      >
        <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
      </WidgetErrorBoundary>
      <WidgetErrorBoundary
        FallbackComponent={HomeWidgetFallback}
        onError={(error) => console.warn('Insights widget failed to render.', error)}
      >
        <LatestInsightsModal visible={insightsOpen} onClose={() => setInsightsOpen(false)} />
      </WidgetErrorBoundary>
      <MultiTFAnalysisModal
        symbol={analysisSymbol}
        onClose={() => setAnalysisSymbol(null)}
        onTrade={(symbol) => {
          setAnalysisSymbol(null);
          router.push({ pathname: '/live-chart', params: { symbol } } as never);
        }}
      />
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
  widgetFallback: { margin: 16, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, gap: 8 },
  widgetFallbackText: { color: c.mutedForeground, fontSize: 12 },
  widgetFallbackRetry: { color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold' },
  homeContent: { paddingHorizontal: 16, gap: 16 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  tickerViewport: { overflow: 'hidden', marginHorizontal: -16, paddingVertical: 2 },
  tickerStatus: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  tickerStatusText: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  tickerRow: { flexDirection: 'row', alignSelf: 'flex-start' },
  tickerCopy: { flexDirection: 'row', gap: 8, paddingLeft: 16, paddingRight: 8 },
  tickerPill: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, minWidth: 100 },
  tickerSymbol: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  tickerPrice: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 3 },
  tickerChange: { fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 2 },
  visionRow: { flexDirection: 'row', gap: 8 },
  visionCard: { flex: 1, minHeight: 54, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  visionTitle: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_700Bold' },
  visionSub: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_400Regular' },
  pickerMessage: { color: '#FFB020', fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: -6 },
  sectionLabel: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.15 },
  sessionTicker: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: colors.radius, flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
  session: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 6 },
  sessionDot: { width: 7, height: 7, borderRadius: 4 },
  sessionCity: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold', flex: 1 },
  sessionState: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  widgets: { flexDirection: 'row', gap: 10 },
  widget: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: colors.radius, padding: 13, minHeight: 150 },
  fearWidget: { flex: .85 }, biasWidget: { flex: 1.35 },
  biasHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  fullAnalysis: { color: '#00F0FF', fontSize: 9, fontFamily: 'Inter_700Bold' },
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

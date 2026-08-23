import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

const c = colors.light;

const SESSION_PAIRS: Record<string, string[]> = {
  london: ['AAPL', 'MSFT', 'AMZN', 'GOOGL'],
  'new york': ['SPY', 'QQQ', 'NVDA', 'TSLA'],
  tokyo: ['META', 'AAPL', 'NVDA', 'GOOGL'],
  sydney: ['META', 'AAPL', 'NVDA', 'GOOGL'],
};

const DEFAULT_PAIRS = ['AAPL', 'MSFT', 'AMZN', 'GOOGL'];

const REFRESH_INTERVAL_MS = 60_000;

type FinnhubQuote = {
  c?: number | null; // current price
  pc?: number | null; // previous close
  dp?: number | null; // percent change
};

type ForexQuote = {
  symbol: string;
  price: number;
  changePercent: number;
};

function resolvePairs(sessionName: string): string[] {
  return SESSION_PAIRS[sessionName.trim().toLowerCase()] ?? DEFAULT_PAIRS;
}

export default function SessionDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionName?: string }>();
  const sessionName =
    typeof params.sessionName === 'string' && params.sessionName.trim().length > 0
      ? params.sessionName.trim()
      : 'Global';

  const [quotes, setQuotes] = useState<ForexQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const inFlight = new Set<AbortController>();
    const pairs = resolvePairs(sessionName);

    const load = async (isInitial: boolean) => {
      const requestId = ++latestRequest;
      const controller = new AbortController();
      inFlight.add(controller);
      if (isInitial) {
        try { setLoading(true); } catch { /* screen unmounted */ }
      }
      try { setError(null); } catch { /* screen unmounted */ }
      try {
        const apiKey = process.env.EXPO_PUBLIC_FINNHUB_API_KEY || '';
        if (!apiKey) {
          throw new Error('Env Var Failed: Finnhub API Key is undefined in the bundle.');
        }
        const results = await Promise.all(
          pairs.map(async (sym) => {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${apiKey}`,
              { signal: controller.signal },
            );
            if (!res.ok) throw new Error(`Finnhub API Error: ${res.status}`);
            const data = (await res.json()) as FinnhubQuote;
            return { symbol: sym, data };
          }),
        );
        const resolved = results.flatMap(({ symbol, data }) => {
          const rawPrice =
            typeof data.c === 'number' && data.c !== 0
              ? data.c
              : typeof data.pc === 'number'
                ? data.pc
                : 0;
          const rawChange = typeof data.dp === 'number' ? data.dp : 0;
          const price = Number.isFinite(rawPrice) ? rawPrice : 0;
          if (price === 0) return [];
          return [
            {
              symbol,
              price,
              changePercent: Number.isFinite(rawChange) ? rawChange : 0,
            },
          ];
        });
        if (resolved.length === 0) {
          throw new Error('Finnhub returned no usable quotes.');
        }
        if (active && requestId === latestRequest) {
          setQuotes(resolved);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (active && requestId === latestRequest) {
          setError(err instanceof Error ? err.message : 'Failed to load live pairs.');
        }
      } finally {
        inFlight.delete(controller);
        if (active && requestId === latestRequest) {
          setLoading(false);
        }
      }
    };

    load(true);
    const timer = setInterval(() => load(false), REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
      for (const controller of inFlight) {
        controller.abort();
      }
      inFlight.clear();
    };
  }, [sessionName, reloadKey]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          testID="session-details-back"
        >
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sessionName} Session
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={styles.stateText}>Loading live pairs...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Feather name="alert-triangle" size={28} color={c.destructive} />
          <Text style={styles.stateText}>Live quotes unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setReloadKey((key) => key + 1)}
            accessibilityLabel="Retry loading live pairs"
            testID="session-details-retry"
          >
            <Feather name="refresh-cw" size={14} color={c.primaryForeground} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {quotes.map((quote) => {
            const positive = quote.changePercent >= 0;
            const changeColor = positive ? c.success : c.destructive;
            return (
              <View key={quote.symbol} style={styles.card}>
                <View style={styles.cardLeft}>
                  <Text style={styles.symbol}>{quote.symbol}</Text>
                  <Text style={styles.price}>{quote.price.toFixed(2)}</Text>
                </View>
                <View style={[styles.changeBadge, { backgroundColor: `${changeColor}1A` }]}>
                  <Feather
                    name={positive ? 'trending-up' : 'trending-down'}
                    size={13}
                    color={changeColor}
                  />
                  <Text style={[styles.changeText, { color: changeColor }]}>
                    {positive ? '+' : ''}
                    {quote.changePercent.toFixed(2)}%
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.disclaimer}>
            Live quotes via Finnhub · refreshes every 60 seconds.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: c.foreground,
  },
  headerSpacer: { width: 40 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  stateText: { fontSize: 15, color: c.mutedForeground, textAlign: 'center' },
  errorText: { fontSize: 12, color: c.destructive, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: c.primaryForeground },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardLeft: { gap: 4 },
  symbol: { fontSize: 16, fontWeight: '700', color: c.foreground },
  price: { fontSize: 14, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  disclaimer: {
    marginTop: 8,
    fontSize: 11,
    color: c.mutedForeground,
    textAlign: 'center',
    lineHeight: 16,
  },
});

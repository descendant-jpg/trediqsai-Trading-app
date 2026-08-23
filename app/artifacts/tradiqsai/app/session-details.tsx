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
  london: ['EUR/USD', 'GBP/USD', 'EUR/GBP'],
  'new york': ['EUR/USD', 'USD/JPY', 'GBP/USD'],
  tokyo: ['USD/JPY', 'AUD/USD', 'NZD/USD'],
  sydney: ['USD/JPY', 'AUD/USD', 'NZD/USD'],
};

const DEFAULT_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY'];

const REFRESH_INTERVAL_MS = 60_000;

type TwelveDataQuote = {
  symbol?: string;
  close?: string;
  previous_close?: string;
  percent_change?: string;
};

type TwelveDataResponse = {
  status?: string;
  code?: number | string;
  message?: string;
  [symbol: string]: unknown;
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
    const pairs = resolvePairs(sessionName);

    const load = async (isInitial: boolean) => {
      if (isInitial) {
        try { setLoading(true); } catch { /* screen unmounted */ }
      }
      try { setError(null); } catch { /* screen unmounted */ }
      try {
        const symbols = pairs.join(',');
        const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${process.env.EXPO_PUBLIC_STOCK_API_KEY || ''}`;
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
          (item): item is TwelveDataQuote =>
            typeof item === 'object' && item !== null && typeof (item as TwelveDataQuote).symbol === 'string',
        );
        const quotesBySymbol = new Map<string, ForexQuote>();
        for (const quote of dataArray) {
          if (!quote.symbol) continue;
          const rawPrice = quote.close
            ? Number.parseFloat(String(quote.close))
            : quote.previous_close
              ? Number.parseFloat(String(quote.previous_close))
              : 0;
          const rawChange = quote.percent_change
            ? Number.parseFloat(String(quote.percent_change))
            : 0;
          quotesBySymbol.set(quote.symbol, {
            symbol: quote.symbol,
            price: Number.isFinite(rawPrice) ? rawPrice : 0,
            changePercent: Number.isFinite(rawChange) ? rawChange : 0,
          });
        }
        const resolved = pairs.flatMap((symbol) => {
          const quote = quotesBySymbol.get(symbol);
          return quote ? [quote] : [];
        });
        if (resolved.length === 0) {
          throw new Error('Twelve Data returned no usable quotes.');
        }
        if (active) {
          setQuotes(resolved);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load live pairs.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load(true);
    const timer = setInterval(() => load(false), REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
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
                  <Text style={styles.price}>{quote.price.toFixed(5)}</Text>
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
            Live quotes via Twelve Data · refreshes every 60 seconds.
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

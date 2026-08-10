import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useLiveMarket } from '@/hooks/useLiveMarket';
import { closeTrade, type TradeRecord } from '@/services/TradeService';
import { supabase } from '@/utils/supabase';
import colors from '@/constants/colors';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type ViewMode = 'active' | 'history';

/** The live feed covers BTC/USD only — never price other assets with it. */
const LIVE_FEED_ASSET = 'BTC/USD';

/**
 * Portfolio tab — the user's open positions and closed trade history,
 * fetched from Supabase. Close Position writes status + close price; the
 * database trigger owns the final P&L.
 */
export default function PortfolioScreen() {
  const { session } = useAuth();
  const { livePrice } = useLiveMarket();
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [openTrades, setOpenTrades] = useState<TradeRecord[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!session) return;
    try {
      const [tradesRes, profileRes] = await Promise.all([
        supabase
          .from('trades')
          .select('id, user_id, asset, side, entry_price, close_price, status, pnl')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single(),
      ]);
      if (tradesRes.error) throw tradesRes.error;
      const rows = (tradesRes.data ?? []) as TradeRecord[];
      setOpenTrades(rows.filter((t) => t.status === 'OPEN'));
      setTradeHistory(rows.filter((t) => t.status === 'CLOSED'));
      // Balance is optional — the profiles table may not exist until the
      // drawdown SQL has been run; don't block the trade lists on it. Clear
      // it when unavailable so a stale value never leaks into the equity.
      if (!profileRes.error && profileRes.data?.balance != null) {
        setBalance(Number(profileRes.data.balance));
      } else {
        setBalance(null);
      }
    } catch (err: any) {
      showAlert('Portfolio', err?.message ?? 'Failed to load trades.');
    } finally {
      setLoaded(true);
    }
  }, [session]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTrades();
    setRefreshing(false);
  }, [fetchTrades]);

  const handleClosePosition = async (trade: TradeRecord) => {
    if (trade.asset !== LIVE_FEED_ASSET) {
      showAlert(
        'Close Position',
        `No live price feed for ${trade.asset} — cannot close this position safely.`,
      );
      return;
    }
    if (livePrice <= 0) {
      showAlert('Close Position', 'Waiting for a live market price — try again in a moment.');
      return;
    }
    setClosingId(trade.id);
    try {
      await closeTrade(trade.id, livePrice);
      await fetchTrades();
    } catch (err: any) {
      showAlert('Close failed', err?.message ?? 'Unknown error');
    } finally {
      setClosingId(null);
    }
  };

  const renderActiveCard = ({ item }: { item: TradeRecord }) => {
    const priceAvailable = item.asset === LIVE_FEED_ASSET && livePrice > 0;
    const unrealized =
      priceAvailable
        ? item.side === 'BUY'
          ? livePrice - item.entry_price
          : item.entry_price - livePrice
        : null;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.asset}>{item.asset}</Text>
          <Text
            style={[
              styles.side,
              { color: item.side === 'BUY' ? '#00F0FF' : '#E54B4B' },
            ]}
          >
            {item.side}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Entry</Text>
          <Text style={styles.value}>${formatPrice(item.entry_price)}</Text>
        </View>
        {unrealized !== null && (
          <View style={styles.cardRow}>
            <Text style={styles.label}>Unrealized P&L</Text>
            <Text
              style={[
                styles.value,
                { color: unrealized >= 0 ? '#2ECA8B' : '#E54B4B' },
              ]}
            >
              {unrealized >= 0 ? '+' : '-'}${formatPrice(Math.abs(unrealized))}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.closeButton, closingId === item.id && styles.disabled]}
          onPress={() => handleClosePosition(item)}
          disabled={closingId !== null}
          activeOpacity={0.85}
          testID={`close-${item.id}`}
        >
          {closingId === item.id ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.closeButtonText}>Close Position</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderHistoryCard = ({ item }: { item: TradeRecord }) => {
    const pnl = item.pnl ?? 0;
    const positive = pnl >= 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.asset}>{item.asset}</Text>
          <Text
            style={[
              styles.side,
              { color: item.side === 'BUY' ? '#00F0FF' : '#E54B4B' },
            ]}
          >
            {item.side}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Entry</Text>
          <Text style={styles.value}>${formatPrice(item.entry_price)}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Close</Text>
          <Text style={styles.value}>
            {item.close_price != null ? `$${formatPrice(item.close_price)}` : '—'}
          </Text>
        </View>
        <View style={[styles.cardRow, styles.pnlRow]}>
          <Text style={styles.label}>P&L</Text>
          <Text
            style={[styles.pnl, { color: positive ? '#2ECA8B' : '#E54B4B' }]}
          >
            {positive ? '+' : '-'}${formatPrice(Math.abs(pnl))}
          </Text>
        </View>
      </View>
    );
  };

  const data = viewMode === 'active' ? openTrades : tradeHistory;

  // --- Account analytics (computed from Supabase data) ---
  const closedCount = tradeHistory.length;
  const winCount = tradeHistory.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : null;
  const totalPnl = tradeHistory.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const unrealizedTotal = openTrades.reduce((sum, t) => {
    if (t.asset !== LIVE_FEED_ASSET || livePrice <= 0) return sum;
    return sum + (t.side === 'BUY' ? livePrice - t.entry_price : t.entry_price - livePrice);
  }, 0);
  const equity = balance != null ? balance + unrealizedTotal : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Portfolio</Text>

      {/* Account Analytics dashboard */}
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsHeading}>ACCOUNT ANALYTICS</Text>
        <View style={styles.equityBlock}>
          <Text style={styles.label}>Total Simulated Equity</Text>
          <Text style={styles.equityValue} testID="analytics-equity">
            {equity != null ? `$${formatPrice(equity)}` : '—'}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.label}>Win Rate</Text>
            <Text style={styles.statValue} testID="analytics-winrate">
              {winRate != null ? `${winRate.toFixed(1)}%` : '—'}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.label}>Total P&L</Text>
            <Text
              style={[
                styles.statValue,
                { color: totalPnl >= 0 ? '#2ECA8B' : '#E54B4B' },
              ]}
              testID="analytics-pnl"
            >
              {totalPnl >= 0 ? '+' : '-'}${formatPrice(Math.abs(totalPnl))}
            </Text>
          </View>
        </View>
      </View>

      {/* Sticky mode toggle */}
      <View style={styles.toggle}>
        {(['active', 'history'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.toggleButton, viewMode === mode && styles.toggleActive]}
            onPress={() => setViewMode(mode)}
            activeOpacity={0.85}
            testID={`portfolio-${mode}`}
          >
            <Text
              style={[
                styles.toggleText,
                viewMode === mode && styles.toggleTextActive,
              ]}
            >
              {mode === 'active' ? 'Active Positions' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={(t) => t.id}
        renderItem={viewMode === 'active' ? renderActiveCard : renderHistoryCard}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00F0FF"
            colors={['#00F0FF']}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {!session
              ? 'Sign in to see your trades.'
              : !loaded
                ? 'Loading trades…'
                : viewMode === 'active'
                  ? 'No open positions. Hit the Trading Floor to open one.'
                  : 'No closed trades yet.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
    paddingTop: 64,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  analyticsCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 16,
    gap: 12,
  },
  analyticsHeading: {
    color: '#8A8D93',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
  },
  equityBlock: {
    gap: 2,
  },
  equityValue: {
    color: '#00F0FF',
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#22252A',
    paddingTop: 12,
  },
  statCell: {
    flex: 1,
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#22252A',
    marginRight: 16,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  toggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: '#22252A',
    padding: 4,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    height: 40,
    borderRadius: colors.radius - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#0A0B0E',
    borderWidth: 1,
    borderColor: '#00F0FF',
  },
  toggleText: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleTextActive: {
    color: '#00F0FF',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 16,
    gap: 10,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  asset: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  side: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  label: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  pnlRow: {
    borderTopWidth: 1,
    borderTopColor: '#22252A',
    paddingTop: 10,
  },
  pnl: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  closeButton: {
    height: 46,
    borderRadius: colors.radius,
    backgroundColor: '#E54B4B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  empty: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 48,
  },
  disabled: {
    opacity: 0.7,
  },
});

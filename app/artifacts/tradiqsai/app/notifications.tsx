import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketNews, type MarketNews } from '@/services/supabaseService';
import { NewsDetailModal } from '@/components/NewsDetailModal';
import colors from '@/constants/colors';

const c = colors.light;
const READ_KEY = 'tradiqs.notifications.read.v1';

type CategoryFilter = 'all' | 'crypto' | 'forex' | 'stocks';
const filters: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'forex', label: 'Forex' },
  { id: 'stocks', label: 'Stocks' },
];

function relativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Just now';
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (minutes < 60) return `${minutes || 1}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

const sentimentColor = (sentiment: MarketNews['sentiment']) =>
  sentiment === 'Bullish' ? '#2ECA8B' : sentiment === 'Bearish' ? '#FF6576' : '#8A8D93';

/**
 * Notifications — the live financial news wire. Headlines are fetched by the
 * API server from Finnhub and curated into the market_news table with an AI
 * brief; tapping a card opens the full in-app reader.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MarketNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [selected, setSelected] = useState<MarketNews | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setFailed(false);
    try {
      const data = await fetchMarketNews();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(READ_KEY)
      .then((raw) => raw && setRead(JSON.parse(raw)))
      .catch(() => {});
    void load();
  }, [load]);

  const unread = useMemo(
    () => items.filter((n) => !read.includes(String(n.id))).length,
    [items, read],
  );
  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.category === filter)),
    [items, filter],
  );

  const markRead = (id: string) => {
    const next = [...new Set([...read, id])];
    setRead(next);
    AsyncStorage.setItem(READ_KEY, JSON.stringify(next)).catch(() => {});
  };

  const openArticle = (item: MarketNews) => {
    markRead(String(item.id));
    setSelected(item);
  };

  const tradeImpactedAsset = () => {
    setSelected(null);
    router.dismiss();
    setTimeout(() => router.navigate('/(tabs)' as never), 0);
  };

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Notifications</Text>
          <Text style={s.subtitle}>
            {unread ? `${unread} unread market updates` : 'All caught up'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close notifications">
          <Feather name="x" size={23} color={c.foreground} />
        </TouchableOpacity>
      </View>

      <View style={s.filters}>
        {filters.map((option) => (
          <TouchableOpacity
            key={option.id}
            onPress={() => setFilter(option.id)}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${option.label}`}
            style={[s.filter, filter === option.id && s.filterActive]}
          >
            <Text style={[s.filterText, filter === option.id && s.filterTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.listScroll}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={c.primary}
          />
        }
      >
        {loading ? (
          <View style={s.state}>
            <ActivityIndicator color={c.primary} />
            <Text style={s.muted}>Loading the market wire…</Text>
          </View>
        ) : failed ? (
          <TouchableOpacity onPress={() => void load()} style={s.state} accessibilityRole="button">
            <Feather name="wifi-off" size={22} color={c.mutedForeground} />
            <Text style={s.muted}>The market wire is temporarily unavailable. Tap to retry.</Text>
          </TouchableOpacity>
        ) : !items.length ? (
          <View style={s.state}>
            <Feather name="inbox" size={25} color={c.mutedForeground} />
            <Text style={s.muted}>No market news yet. Pull down to refresh.</Text>
          </View>
        ) : !filtered.length ? (
          <View style={s.state}>
            <Feather name="filter" size={25} color={c.mutedForeground} />
            <Text style={s.muted}>No {filter} headlines yet.</Text>
          </View>
        ) : (
          filtered.map((item) => {
            const id = String(item.id);
            const isUnread = !read.includes(id);
            return (
              <TouchableOpacity
                key={id}
                onPress={() => openArticle(item)}
                style={[s.card, isUnread && s.unread]}
                accessibilityRole="button"
                accessibilityLabel={`Read: ${item.headline}`}
              >
                <View style={s.top}>
                  <View style={s.sourceTag}>
                    <Text style={s.sourceTagText}>{item.category.toUpperCase()}</Text>
                  </View>
                  <View style={[s.sentimentDot, { backgroundColor: sentimentColor(item.sentiment) }]} />
                  <Text style={s.sentiment}>{item.sentiment}</Text>
                  <Text style={s.time}>{relativeTime(item.published_at)}</Text>
                </View>
                <Text style={s.headline}>{item.headline}</Text>
                <Text numberOfLines={2} style={s.summary}>
                  {item.ai_summary}
                </Text>
                <Text style={s.readCta}>READ BRIEF ›</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <NewsDetailModal
        article={selected}
        onClose={() => setSelected(null)}
        onTrade={tradeImpactedAsset}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  title: { color: c.foreground, fontSize: 25, fontFamily: 'Inter_700Bold' },
  subtitle: { color: c.mutedForeground, fontSize: 11, marginTop: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 18, paddingBottom: 6 },
  filter: { borderWidth: 1, borderColor: c.border, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: c.card },
  filterActive: { backgroundColor: `${c.primary}18`, borderColor: c.primary },
  filterText: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_700Bold' },
  filterTextActive: { color: c.primary },
  listScroll: { flex: 1 },
  list: { gap: 11, paddingTop: 16, paddingBottom: 30 },
  card: { backgroundColor: c.card, borderRadius: 13, borderWidth: 1, borderColor: c.border, padding: 15, gap: 10 },
  unread: { borderLeftColor: c.primary, borderLeftWidth: 3 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceTag: { borderColor: `${c.primary}55`, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: `${c.primary}14` },
  sourceTagText: { color: c.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  sentimentDot: { width: 6, height: 6, borderRadius: 3 },
  sentiment: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', flex: 1 },
  time: { color: c.mutedForeground, fontSize: 10 },
  headline: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 20 },
  summary: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 },
  readCta: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  muted: { color: c.mutedForeground, fontSize: 12, textAlign: 'center' },
});

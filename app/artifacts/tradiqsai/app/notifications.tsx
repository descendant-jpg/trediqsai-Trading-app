import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';
import { NewsDetailModal } from '@/components/NewsDetailModal';
import { fetchMarketNews, type MarketNews } from '@/services/supabaseService';

const c = colors.light;
const KEY = 'tradiqs.notifications.read.v1';
type Category = 'AI Alerts' | 'News' | 'System' | 'Pro Offers';
type NotificationItem = {
  id: string; category: Category; asset: string; title: string; body: string;
  timestamp: string; tags: string[]; tone: 'ai' | 'news' | 'system' | 'pro' | 'bullish' | 'bearish';
  unread: boolean; setup?: boolean;
};
const ITEMS: NotificationItem[] = [
  { id: '1', category: 'AI Alerts', asset: 'BTC/USD', title: 'Breakout watch activated', body: 'Momentum is building above the current range. Watch for confirmation before committing risk.', timestamp: '1m ago', tags: ['BTC/USD', '• AI ALERT'], tone: 'ai', unread: true, setup: true },
  { id: '3', category: 'System', asset: 'ACCOUNT', title: 'Daily review ready', body: 'Your simulated account summary is available with today’s risk and execution overview.', timestamp: '2h ago', tags: ['ACCOUNT', '• SYSTEM'], tone: 'system', unread: false },
  { id: '4', category: 'Pro Offers', asset: 'PRO', title: 'Unlock deeper signals', body: 'See targets, rationale, and advanced analytics with TradiQs Pro access.', timestamp: '4h ago', tags: ['PRO', '• OFFER'], tone: 'pro', unread: true },
  { id: '5', category: 'AI Alerts', asset: 'XAU/USD', title: 'Gold setup is forming', body: 'The Oracle has identified a possible liquidity sweep near the London session high.', timestamp: 'Yesterday', tags: ['XAU/USD', '• AI ALERT'], tone: 'ai', unread: false, setup: true },
];
const FILTERS: Array<{ label: 'All' | Category; icon: React.ComponentProps<typeof Feather>['name'] }> = [
  { label: 'All', icon: 'inbox' }, { label: 'AI Alerts', icon: 'cpu' }, { label: 'News', icon: 'zap' }, { label: 'System', icon: 'shield' }, { label: 'Pro Offers', icon: 'gift' },
];
const iconFor = (item: NotificationItem): React.ComponentProps<typeof Feather>['name'] => item.category === 'AI Alerts' ? 'cpu' : item.category === 'News' ? 'zap' : item.category === 'System' ? 'shield' : 'gift';
const toneColor = (tone: NotificationItem['tone']) => tone === 'news' || tone === 'bullish' ? '#FFB020' : tone === 'bearish' ? c.destructive : tone === 'ai' ? c.primary : tone === 'pro' ? c.secondary : c.mutedForeground;
const relativeTime = (date: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
  if (minutes < 60) return `${minutes || 1}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};
const toneForNews = (sentiment: MarketNews['sentiment']): NotificationItem['tone'] =>
  sentiment === 'Bearish' ? 'bearish' : sentiment === 'Bullish' ? 'bullish' : 'news';

export default function NotificationsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['label']>('All');
  const [read, setRead] = useState<string[]>([]);
  const [news, setNews] = useState<MarketNews[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsUnavailable, setNewsUnavailable] = useState(false);
  const [selectedNews, setSelectedNews] = useState<MarketNews | null>(null);
  useEffect(() => { AsyncStorage.getItem(KEY).then((raw) => raw && setRead(JSON.parse(raw))).catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    void fetchMarketNews()
      .then((items) => { if (active) setNews(items); })
      .catch(() => { if (active) setNewsUnavailable(true); })
      .finally(() => { if (active) setNewsLoading(false); });
    return () => { active = false; };
  }, []);
  const mark = (id: string) => { const next = [...new Set([...read, id])]; setRead(next); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); };
  const newsRows = useMemo<NotificationItem[]>(() => news.map((item) => ({ id: `news-${item.id}`, category: 'News', asset: item.category.toUpperCase(), title: item.headline, body: item.ai_summary, timestamp: relativeTime(item.published_at), tags: [item.category.toUpperCase(), `• ${item.sentiment.toUpperCase()}`], tone: toneForNews(item.sentiment), unread: true })), [news]);
  const allRows = useMemo(() => [...newsRows, ...ITEMS], [newsRows]);
  const rows = useMemo(() => allRows.filter((item) => filter === 'All' || item.category === filter), [allRows, filter]);
  const unreadCount = allRows.filter((item) => item.unread && !read.includes(item.id)).length;
  const openSignalDesk = () => {
    router.dismiss();
    setTimeout(() => router.navigate('/signals' as never), 0);
  };
  return <View style={styles.container}>
    <View style={styles.header}><View><Text style={styles.title}>Notifications</Text><Text style={styles.subtitle}>{unreadCount ? `${unreadCount} Unread Alerts` : 'All caught up'}</Text></View><TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close notifications"><Feather name="x" size={23} color={c.foreground} /></TouchableOpacity></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{FILTERS.map((item) => <TouchableOpacity key={item.label} onPress={() => setFilter(item.label)} style={[styles.filter, filter === item.label && styles.filterActive]} accessibilityRole="button" accessibilityLabel={`Filter ${item.label}`}><Feather name={item.icon} size={18} color={filter === item.label ? c.primary : c.mutedForeground} /><Text style={[styles.filterText, filter === item.label && styles.filterTextActive]}>{item.label}</Text></TouchableOpacity>)}</ScrollView>
    <ScrollView contentContainerStyle={styles.list}><View style={styles.groupHeader}><View style={styles.line} /><Text style={styles.groupText}>TODAY</Text><View style={styles.line} /></View>{filter === 'News' && newsLoading ? <View style={styles.state}><ActivityIndicator color={c.primary} /><Text style={styles.stateText}>Loading market briefings…</Text></View> : null}{filter === 'News' && newsUnavailable ? <View style={styles.state}><Feather name="wifi-off" size={20} color={c.mutedForeground} /><Text style={styles.stateText}>Market news is temporarily unavailable.</Text></View> : null}{filter === 'News' && !newsLoading && !newsUnavailable && !news.length ? <View style={styles.state}><Feather name="inbox" size={20} color={c.mutedForeground} /><Text style={styles.stateText}>Fresh market briefings will appear here.</Text></View> : null}{rows.map((item) => { const isUnread = item.unread && !read.includes(item.id); const linkedNews = item.category === 'News' ? news.find((article) => `news-${article.id}` === item.id) ?? null : null; return <Pressable key={item.id} onPress={() => { mark(item.id); if (linkedNews) setSelectedNews(linkedNews); }} style={[styles.card, isUnread && styles.unread]} accessibilityRole="button" accessibilityLabel={`${item.title}. ${isUnread ? 'Unread.' : 'Read.'}`}><View style={styles.topRow}><View style={[styles.iconWrap, { backgroundColor: `${toneColor(item.tone)}18` }]}><Feather name={iconFor(item)} size={17} color={toneColor(item.tone)} /></View><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.timestamp}>{item.timestamp}</Text></View><Text style={styles.body}>{item.body}</Text><View style={styles.bottomRow}><View style={styles.tags}>{item.tags.map((tag) => <Text key={tag} style={[styles.tag, { color: toneColor(item.tone), borderColor: `${toneColor(item.tone)}55` }]}>{tag}</Text>)}</View>{item.setup && <Text onPress={openSignalDesk} accessibilityRole="link" accessibilityLabel={`View setup for ${item.asset}`} style={styles.setup}>View Setup ›</Text>}</View></Pressable>; })}</ScrollView>
    <NewsDetailModal article={selectedNews} onClose={() => setSelectedNews(null)} onTrade={() => { setSelectedNews(null); router.push('/(tabs)/live-chart' as never); }} />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: c.background, padding: 20, paddingTop: 58 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, title: { color: c.foreground, fontSize: 25, fontFamily: 'Inter_700Bold' }, subtitle: { color: c.mutedForeground, fontSize: 11, marginTop: 4 }, filters: { gap: 18, paddingVertical: 20 }, filter: { minWidth: 62, alignItems: 'center', gap: 6, paddingBottom: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' }, filterActive: { borderBottomColor: c.primary }, filterText: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' }, filterTextActive: { color: c.primary }, list: { gap: 11, paddingBottom: 30 }, groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 2 }, line: { flex: 1, height: 1, backgroundColor: c.border }, groupText: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.3 }, card: { backgroundColor: c.card, borderRadius: 13, borderWidth: 1, borderColor: c.border, padding: 15, gap: 11 }, unread: { borderLeftColor: c.primary, borderLeftWidth: 3 }, topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, cardTitle: { flex: 1, color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }, timestamp: { color: c.mutedForeground, fontSize: 10 }, body: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 }, bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, tag: { backgroundColor: '#0F1115', borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4, fontSize: 9, fontFamily: 'Inter_700Bold' }, setup: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }, state: { alignItems: 'center', gap: 10, paddingVertical: 38 }, stateText: { color: c.mutedForeground, fontSize: 12 } });
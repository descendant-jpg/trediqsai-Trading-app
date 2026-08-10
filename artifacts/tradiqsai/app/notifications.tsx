import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';

const c = colors.light;
const KEY = 'tradiqs.notifications.read.v1';
const ITEMS = [
  { id: '1', category: 'AI Alerts', asset: 'BTC/USD', title: 'Breakout watch activated', body: 'Momentum is building above the current range.', unread: true },
  { id: '2', category: 'News', asset: 'XAU/USD', title: 'Gold session update', body: 'London liquidity is now active.', unread: true },
  { id: '3', category: 'System', asset: 'ACCOUNT', title: 'Daily review ready', body: 'Your simulated account summary is available.', unread: false },
  { id: '4', category: 'Pro Offers', asset: 'PRO', title: 'Unlock deeper signals', body: 'See targets, rationale, and advanced analytics.', unread: true },
];
const FILTERS = ['All', 'AI Alerts', 'News', 'System', 'Pro Offers'] as const;
export default function NotificationsScreen() {
  const router = useRouter(); const [filter, setFilter] = useState<typeof FILTERS[number]>('All'); const [read, setRead] = useState<string[]>([]);
  useEffect(() => { AsyncStorage.getItem(KEY).then((raw: string | null) => raw && setRead(JSON.parse(raw))).catch(() => {}); }, []);
  const mark = (id: string) => { const next = [...new Set([...read, id])]; setRead(next); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); };
  const rows = useMemo(() => ITEMS.filter((item) => filter === 'All' || item.category === filter), [filter]);
  return <View style={styles.container}><View style={styles.header}><Text style={styles.title}>Notifications</Text><TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close"><Feather name="x" size={23} color={c.foreground} /></TouchableOpacity></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{FILTERS.map((item) => <TouchableOpacity key={item} onPress={() => setFilter(item)} style={[styles.pill, filter === item && styles.pillActive]} accessibilityRole="button" accessibilityLabel={`Filter ${item}`}><Text style={[styles.pillText, filter === item && styles.pillTextActive]}>{item}</Text></TouchableOpacity>)}</ScrollView>
    <ScrollView contentContainerStyle={styles.list}>{rows.map((item) => { const isUnread = item.unread && !read.includes(item.id); return <Pressable key={item.id} onPress={() => mark(item.id)} style={[styles.card, isUnread && styles.unread]} accessibilityRole="button" accessibilityLabel={`${item.title}. ${isUnread ? 'Unread.' : 'Read.'}`}><View style={styles.row}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.asset}>{item.asset}</Text></View><Text style={styles.body}>{item.body}</Text><Text style={styles.meta}>{item.category} · Today</Text></Pressable>; })}</ScrollView>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: c.background, padding: 20, paddingTop: 58 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: c.foreground, fontSize: 24, fontFamily: 'Inter_700Bold' }, filters: { gap: 8, paddingVertical: 22 }, pill: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, backgroundColor: c.card }, pillActive: { backgroundColor: c.primary }, pillText: { color: c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, pillTextActive: { color: c.primaryForeground }, list: { gap: 10, paddingBottom: 30 }, card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 16, gap: 8 }, unread: { borderLeftColor: c.primary, borderLeftWidth: 4 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, cardTitle: { flex: 1, color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }, asset: { color: c.primary, backgroundColor: '#0A2529', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, fontSize: 10, fontFamily: 'Inter_700Bold' }, body: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 }, meta: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' } });
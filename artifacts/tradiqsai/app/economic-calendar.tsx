import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

const c = colors.light;
type Impact = 'High' | 'Med' | 'Low';
type CalendarEvent = { id: string; day: number; time: string; currency: string; title: string; impact: Impact; forecast: string; actual?: string };
const EVENTS: CalendarEvent[] = [
  { id: 'cpi', day: 0, time: '08:30', currency: 'USD', title: 'Core CPI m/m', impact: 'High', forecast: '0.3%', actual: '0.2%' },
  { id: 'gdp', day: 0, time: '10:00', currency: 'USD', title: 'ISM Services PMI', impact: 'High', forecast: '52.5', actual: '53.1' },
  { id: 'eur', day: 0, time: '04:00', currency: 'EUR', title: 'German Trade Balance', impact: 'Med', forecast: '€18.0B', actual: '€20.3B' },
  { id: 'gbp', day: 0, time: '03:00', currency: 'GBP', title: 'Construction PMI', impact: 'Low', forecast: '47.0', actual: '48.2' },
  { id: 'jobs', day: 1, time: '08:30', currency: 'USD', title: 'Initial Jobless Claims', impact: 'High', forecast: '242K' },
  { id: 'boj', day: 1, time: '23:50', currency: 'JPY', title: 'BoJ Summary of Opinions', impact: 'Med', forecast: '—' },
  { id: 'retail', day: 2, time: '08:30', currency: 'USD', title: 'Retail Sales m/m', impact: 'High', forecast: '0.4%' },
  { id: 'employment', day: 2, time: '05:00', currency: 'GBP', title: 'Employment Change', impact: 'Med', forecast: '12K' },
  { id: 'pmi', day: -1, time: '04:00', currency: 'EUR', title: 'Services PMI', impact: 'Low', forecast: '50.5', actual: '51.0' },
];
const IMPACTS: Array<'All' | Impact> = ['All', 'High', 'Med', 'Low'];
const CURRENCIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY'];
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const dateLabel = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
const countdown = (event: CalendarEvent, selected: Date, now: Date) => {
  const [hours, minutes] = event.time.split(':').map(Number);
  const target = new Date(selected); target.setHours(hours, minutes, 0, 0);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'NOW';
  const total = Math.floor(diff / 60000);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
};

export default function EconomicCalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [impact, setImpact] = useState<(typeof IMPACTS)[number]>('All');
  const [currency, setCurrency] = useState('ALL');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const selected = addDays(now, selectedOffset);
  const events = useMemo(() => EVENTS.filter((event) => event.day === selectedOffset && (impact === 'All' || event.impact === impact) && (currency === 'ALL' || event.currency === currency)), [selectedOffset, impact, currency]);
  const dayEvents = EVENTS.filter((event) => event.day === selectedOffset);
  const counts = { All: dayEvents.length, High: dayEvents.filter((e) => e.impact === 'High').length, Med: dayEvents.filter((e) => e.impact === 'Med').length, Low: dayEvents.filter((e) => e.impact === 'Low').length };
  const volatility = Math.min(94, 25 + counts.High * 22 + counts.Med * 8);
  const released = events.filter((event) => event.actual !== undefined);
  const upcoming = events.filter((event) => event.actual === undefined);
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? 20 : insets.top + 10, paddingBottom: insets.bottom + 30 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Feather name="chevron-left" size={23} color={c.foreground} /></TouchableOpacity><View style={styles.headerCenter}><Text style={styles.eyebrow}>MACRO EVENTS</Text><Text style={styles.title}>Economic Calendar</Text></View><Feather name="calendar" size={21} color={c.primary} /></View>
        <View style={styles.session}><View style={styles.liveDot} /><Text style={styles.sessionText}>LONDON SESSION</Text><Text style={styles.sessionTime}>UTC {now.toISOString().slice(11, 16)}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>{[-2, -1, 0, 1, 2].map((offset) => { const date = addDays(now, offset); return <TouchableOpacity key={offset} onPress={() => { setSelectedOffset(offset); setImpact('All'); setCurrency('ALL'); }} style={[styles.date, offset === selectedOffset && styles.dateActive]} accessibilityRole="button" accessibilityLabel={`Select ${date.toDateString()}`}><Text style={[styles.dateDay, offset === selectedOffset && styles.dateActiveText]}>{offset === 0 ? 'TODAY' : dateLabel(date)}</Text><Text style={[styles.dateNumber, offset === selectedOffset && styles.dateActiveText]}>{date.getDate()}</Text></TouchableOpacity>; })}</ScrollView>
        <View style={styles.summary}>{IMPACTS.map((item) => <TouchableOpacity key={item} onPress={() => setImpact(item)} style={[styles.metric, impact === item && styles.metricActive]} accessibilityRole="button" accessibilityLabel={`Filter ${item} impact`}><Text style={styles.metricValue}>{counts[item]}</Text><Text style={[styles.metricLabel, impact === item && styles.metricActiveText]}>{item.toUpperCase()}</Text></TouchableOpacity>)}</View>
        <View style={styles.volatility}><View style={styles.volRow}><Text style={styles.sectionLabel}>VOLATILITY OUTLOOK</Text><Text style={styles.volValue}>{volatility}%</Text></View><View style={styles.track}><View style={[styles.trackFill, { width: `${volatility}%` }]} /></View><Text style={styles.helper}>Based on high-impact releases for the selected day</Text></View>
        <Text style={styles.sectionLabel}>CURRENCY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{CURRENCIES.map((item) => <TouchableOpacity key={item} onPress={() => setCurrency(item)} style={[styles.chip, currency === item && styles.chipActive]} accessibilityRole="button" accessibilityLabel={`Filter ${item} events`}><Text style={[styles.chipText, currency === item && styles.chipActiveText]}>{item}</Text></TouchableOpacity>)}</ScrollView>
        <EventGroup title="RELEASED" events={released} selected={selected} now={now} />
        <EventGroup title="UPCOMING" events={upcoming} selected={selected} now={now} />
        {events.length === 0 && <Text style={styles.empty}>No events match these filters.</Text>}
      </ScrollView>
    </View>
  );
}
function EventGroup({ title, events, selected, now }: { title: string; events: CalendarEvent[]; selected: Date; now: Date }) {
  if (events.length === 0) return null;
  return <View style={styles.group}><Text style={styles.sectionLabel}>{title}</Text>{events.map((event) => <View key={event.id} style={[styles.event, event.impact === 'High' && styles.highEvent]}><View style={styles.eventTime}><Text style={styles.time}>{event.time}</Text><Text style={[styles.impact, { color: event.impact === 'High' ? c.destructive : event.impact === 'Med' ? '#FFB74D' : c.mutedForeground }]}>{event.impact}</Text></View><View style={styles.eventBody}><View style={styles.eventTitleRow}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.currency}>{event.currency}</Text></View>{event.actual ? <Text style={styles.actual}>✓ DONE  <Text style={styles.values}>Actual {event.actual} · Forecast {event.forecast}</Text></Text> : <Text style={styles.countdown}>IN {countdown(event, selected, now)} · Forecast {event.forecast}</Text>}</View></View>)}</View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: c.background }, content: { paddingHorizontal: 18, gap: 14 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerCenter: { alignItems: 'center' }, eyebrow: { color: c.primary, fontSize: 10, letterSpacing: 1.3, fontFamily: 'Inter_700Bold' }, title: { color: c.foreground, fontSize: 21, fontFamily: 'Inter_700Bold', marginTop: 3 }, session: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 11 }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success }, sessionText: { flex: 1, color: c.foreground, fontSize: 11, fontFamily: 'Inter_700Bold' }, sessionTime: { color: c.mutedForeground, fontSize: 10 }, dateStrip: { gap: 8 }, date: { minWidth: 64, alignItems: 'center', paddingVertical: 10, borderRadius: 11, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, dateActive: { backgroundColor: c.primary, borderColor: c.primary }, dateDay: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold' }, dateNumber: { color: c.foreground, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 3 }, dateActiveText: { color: c.primaryForeground }, summary: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 8 }, metric: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 }, metricActive: { backgroundColor: '#0A2529' }, metricValue: { color: c.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' }, metricLabel: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 3 }, metricActiveText: { color: c.primary }, volatility: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 9 }, volRow: { flexDirection: 'row', justifyContent: 'space-between' }, sectionLabel: { color: c.mutedForeground, fontSize: 10, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' }, volValue: { color: c.primary, fontFamily: 'Inter_700Bold' }, track: { height: 7, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }, trackFill: { height: '100%', backgroundColor: c.primary, borderRadius: 4 }, helper: { color: c.mutedForeground, fontSize: 10 }, chips: { gap: 8 }, chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: c.card }, chipActive: { backgroundColor: c.primary }, chipText: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_700Bold' }, chipActiveText: { color: c.primaryForeground }, group: { gap: 8, marginTop: 4 }, event: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border }, highEvent: { borderLeftColor: c.destructive, borderLeftWidth: 3 }, eventTime: { width: 50, gap: 6 }, time: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_700Bold' }, impact: { fontSize: 10, fontFamily: 'Inter_700Bold' }, eventBody: { flex: 1, gap: 7 }, eventTitleRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, eventTitle: { flex: 1, color: c.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }, currency: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold' }, actual: { color: c.success, fontSize: 10, fontFamily: 'Inter_700Bold' }, values: { color: c.mutedForeground, fontFamily: 'Inter_400Regular' }, countdown: { color: '#FFB74D', fontSize: 10, fontFamily: 'Inter_600SemiBold' }, empty: { color: c.mutedForeground, textAlign: 'center', marginTop: 28 } });
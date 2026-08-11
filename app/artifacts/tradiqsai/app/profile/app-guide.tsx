import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';

const CYAN = '#00F0FF';
const PROGRESS_KEY = 'tradiqs.completed-modules.v1';
const glossary = [
  ['order-block', 'Order Block', 'A zone where institutional orders accumulated before a strong market displacement.'],
  ['liquidity-sweep', 'Liquidity Sweep', 'A temporary move through obvious highs or lows that collects resting orders before reversing.'],
  ['fvg', 'Fair Value Gap (FVG)', 'An imbalance between candles that price may revisit as the market seeks efficient delivery.'],
  ['break-of-structure', 'Break of Structure', 'A decisive move beyond a prior swing that signals a potential change in market direction.'],
] as const;

export default function AppGuideScreen() {
  const [open, setOpen] = useState<string | null>(null);
  const [completedModules, setCompletedModules] = useState<string[]>([]);
  useEffect(() => { AsyncStorage.getItem(PROGRESS_KEY).then((raw) => { if (!raw) return; try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setCompletedModules(parsed.filter((id): id is string => typeof id === 'string')); } catch { /* use empty progress */ } }).catch(() => {}); }, []);
  const progress = useMemo(() => Math.round((completedModules.length / glossary.length) * 100), [completedModules]);
  const toggleGlossary = (id: string) => {
    setOpen(open === id ? null : id);
    if (completedModules.includes(id)) return;
    const next = [...completedModules, id];
    setCompletedModules(next);
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
  };
  return <View style={styles.container}><Stack.Screen options={{ title: 'TradiQs Academy', headerShown: true, headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }} /><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>TRADIQS ACADEMY</Text><Text style={styles.title}>Build your edge.</Text><View style={styles.progressCard}><View style={styles.progressHeader}><Text style={styles.progressTitle}>Bootcamp Progress</Text><Text style={styles.percent}>{progress}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View><Text style={styles.muted}>{completedModules.length} of {glossary.length} modules read</Text></View><Text style={styles.section}>TRADING GLOSSARY</Text>{glossary.map(([id, term, definition]) => <View key={id} style={styles.glossary}><TouchableOpacity onPress={() => toggleGlossary(id)} style={styles.glossaryHeader}><View style={styles.termRow}><Feather name={completedModules.includes(id) ? 'check-circle' : 'book-open'} size={15} color={completedModules.includes(id) ? '#2ECA8B' : CYAN} /><Text style={styles.term}>{term}</Text></View><Feather name="chevron-down" size={17} color={CYAN} style={{ transform: [{ rotate: open === id ? '180deg' : '0deg' }] }} /></TouchableOpacity>{open === id && <Text style={styles.definition}>{definition}</Text>}</View>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 40 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '700', letterSpacing: 2 }, title: { color: '#FFF', fontSize: 28, fontWeight: '700', marginTop: 8 }, progressCard: { backgroundColor: '#16181D', borderRadius: 15, borderWidth: 1, borderColor: '#262930', padding: 17, marginTop: 22 }, progressHeader: { flexDirection: 'row', justifyContent: 'space-between' }, progressTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' }, percent: { color: CYAN, fontSize: 15, fontWeight: '700' }, track: { height: 8, borderRadius: 4, backgroundColor: '#30343D', overflow: 'hidden', marginTop: 15 }, fill: { height: '100%', backgroundColor: CYAN }, muted: { color: '#737983', fontSize: 11, marginTop: 9 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 28, marginBottom: 10 }, glossary: { backgroundColor: '#16181D', borderRadius: 12, borderWidth: 1, borderColor: '#262930', marginBottom: 8, paddingHorizontal: 14 }, glossaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 53 }, termRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, term: { color: '#FFF', fontSize: 13, fontWeight: '700' }, definition: { color: '#9A9FA8', fontSize: 12, lineHeight: 18, paddingBottom: 14 } });
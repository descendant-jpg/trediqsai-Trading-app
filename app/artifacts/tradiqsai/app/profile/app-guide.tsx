import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';

const CYAN = '#00F0FF';
const PROGRESS_KEY = 'tradiqs.completed-modules.v2';
type Term = { id: string; title: string; definition: string };
const terms: Term[] = [
  { id: 'ob', title: 'Order Block', definition: 'A zone where institutional orders accumulated before a strong market displacement.' },
  { id: 'fvg', title: 'Fair Value Gap (FVG)', definition: 'An imbalance between candles that price may revisit as the market seeks efficient delivery.' },
  { id: 'choch', title: 'Change of Character (ChoCh)', definition: 'The first meaningful break against the current market structure, often signaling a potential reversal.' },
  { id: 'liquidity', title: 'Liquidity Sweep', definition: 'A move through obvious highs or lows that collects resting orders before reversing.' },
  { id: 'bos', title: 'Break of Structure', definition: 'A decisive move beyond a prior swing that signals continuation or a potential change in direction.' },
];
const videos = [
  { title: 'Reading Institutional Flow', color: '#263D50' },
  { title: 'Mastering Market Structure', color: '#352750' },
  { title: 'The Liquidity Playbook', color: '#244A45' },
];

export default function AppGuideScreen() {
  const [open, setOpen] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [balance, setBalance] = useState('');
  const [risk, setRisk] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [lotSize, setLotSize] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PROGRESS_KEY).then((raw) => {
      if (!raw) return;
      try { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed)) setCompleted(parsed.filter((id): id is string => typeof id === 'string')); } catch { /* retain empty progress */ }
    }).catch(() => {});
  }, []);

  const filteredTerms = useMemo(() => {
    const value = query.trim().toLowerCase();
    return terms.filter((term) => !value || `${term.title} ${term.definition}`.toLowerCase().includes(value));
  }, [query]);
  const markRead = (id: string) => {
    setOpen(open === id ? null : id);
    if (completed.includes(id)) return;
    const next = [...completed, id];
    setCompleted(next);
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
  };
  const calculate = () => {
    const account = Number(balance);
    const percentage = Number(risk);
    const pips = Number(stopLoss);
    if (account > 0 && percentage > 0 && pips > 0) setLotSize((account * percentage / 100 / (pips * 10)).toFixed(2));
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'TradiQs Academy', headerShown: true, headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>TRADIQS ACADEMY</Text>
        <Text style={styles.title}>Build your edge.</Text>
        <View style={styles.hud}><Text style={styles.hudLabel}>DAILY ALPHA</Text><Text style={styles.quote}>“Amateurs focus on how much they can make. Professionals focus on how much they can lose.”</Text></View>
        <Text style={styles.section}>YOUTUBE MASTERCLASSES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {videos.map((video) => <TouchableOpacity key={video.title} style={[styles.video, { backgroundColor: video.color }]} onPress={() => Linking.openURL('https://youtube.com/watch?v=YOUR_MOCK_VIDEO_ID')} activeOpacity={0.85}><Feather name="play-circle" size={38} color={CYAN} style={styles.play} /><Text style={styles.videoTitle}>{video.title}</Text><Text style={styles.videoMeta}>MASTERCLASS · 12 MIN</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={styles.progressCard}><View style={styles.progressHeader}><Text style={styles.progressTitle}>Bootcamp Progress</Text><Text style={styles.percent}>{Math.round(completed.length / terms.length * 100)}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${completed.length / terms.length * 100}%` }]} /></View><Text style={styles.muted}>{completed.length} of {terms.length} dictionary modules read</Text></View>
        <Text style={styles.section}>TRADING DICTIONARY</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search terms (e.g., Order Block, FVG, ChoCh)..." placeholderTextColor="#737983" style={styles.search} />
        {filteredTerms.map((term) => <View key={term.id} style={styles.card}><TouchableOpacity onPress={() => markRead(term.id)} style={styles.glossaryHeader}><View style={styles.termRow}><Feather name={completed.includes(term.id) ? 'check-circle' : 'book-open'} size={15} color={completed.includes(term.id) ? '#2ECA8B' : CYAN} /><Text style={styles.term}>{term.title}</Text></View><Feather name="chevron-down" size={17} color={CYAN} style={{ transform: [{ rotate: open === term.id ? '180deg' : '0deg' }] }} /></TouchableOpacity>{open === term.id && <Text style={styles.definition}>{term.definition}</Text>}</View>)}
        <Text style={styles.section}>TRADER'S TOOLKIT</Text>
        <TouchableOpacity style={styles.toolCard} onPress={() => setCalculatorOpen(true)}><View><Text style={styles.toolTitle}>Lot Size Calculator</Text><Text style={styles.muted}>Size every position with discipline.</Text></View><Feather name="arrow-up-right" size={21} color={CYAN} /></TouchableOpacity>
      </ScrollView>
      <Modal visible={calculatorOpen} transparent animationType="slide" onRequestClose={() => setCalculatorOpen(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><TouchableOpacity style={styles.close} onPress={() => setCalculatorOpen(false)}><Feather name="x" size={22} color="#FFF" /></TouchableOpacity><Text style={styles.modalTitle}>Lot Size Calculator</Text>{[['Account Balance ($)', balance, setBalance], ['Risk (%)', risk, setRisk], ['Stop Loss (Pips)', stopLoss, setStopLoss]].map(([label, value, setter]) => <TextInput key={label as string} value={value as string} onChangeText={setter as (value: string) => void} placeholder={label as string} placeholderTextColor="#737983" keyboardType="numeric" style={styles.input} />)}<TouchableOpacity style={styles.calculate} onPress={calculate}><Text style={styles.calculateText}>CALCULATE POSITION</Text></TouchableOpacity>{lotSize && <Text style={styles.result}>Recommended Lot Size: {lotSize}</Text>}</View></View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 48 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '700', letterSpacing: 2 }, title: { color: '#FFF', fontSize: 28, fontWeight: '700', marginTop: 8 }, hud: { backgroundColor: '#16181D', borderLeftWidth: 3, borderLeftColor: CYAN, borderRadius: 10, padding: 15, marginTop: 20 }, hudLabel: { color: CYAN, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, quote: { color: '#D9DCE2', fontSize: 13, lineHeight: 19, marginTop: 8 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 27, marginBottom: 10 }, video: { width: 256, height: 160, borderRadius: 12, marginRight: 12, padding: 14, justifyContent: 'flex-end', overflow: 'hidden' }, play: { position: 'absolute', top: 48, alignSelf: 'center' }, videoTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' }, videoMeta: { color: '#AAB2C0', fontSize: 9, marginTop: 6, letterSpacing: 1 }, progressCard: { backgroundColor: '#16181D', borderRadius: 15, borderWidth: 1, borderColor: '#262930', padding: 17, marginTop: 20 }, progressHeader: { flexDirection: 'row', justifyContent: 'space-between' }, progressTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' }, percent: { color: CYAN, fontSize: 15, fontWeight: '700' }, track: { height: 8, borderRadius: 4, backgroundColor: '#30343D', overflow: 'hidden', marginTop: 15 }, fill: { height: '100%', backgroundColor: CYAN }, muted: { color: '#737983', fontSize: 11, marginTop: 7 }, search: { backgroundColor: '#12141A', color: '#FFF', padding: 13, borderRadius: 9, borderWidth: 1, borderColor: '#2B3039', marginBottom: 10 }, card: { backgroundColor: '#16181D', borderRadius: 12, borderWidth: 1, borderColor: '#262930', marginBottom: 8, paddingHorizontal: 14 }, glossaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 53 }, termRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, term: { color: '#FFF', fontSize: 13, fontWeight: '700' }, definition: { color: '#9A9FA8', fontSize: 12, lineHeight: 18, paddingBottom: 14 }, toolCard: { backgroundColor: '#16181D', borderRadius: 12, borderWidth: 1, borderColor: '#303641', padding: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, toolTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' }, modalBackdrop: { flex: 1, backgroundColor: '#000B', justifyContent: 'flex-end' }, modal: { backgroundColor: '#12141A', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 38 }, close: { alignSelf: 'flex-end', padding: 5 }, modalTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 18 }, input: { backgroundColor: '#1B1E26', color: '#FFF', borderRadius: 9, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#303641' }, calculate: { backgroundColor: CYAN, borderRadius: 10, padding: 17, alignItems: 'center', marginTop: 8 }, calculateText: { color: '#071014', fontWeight: '900', letterSpacing: 1 }, result: { color: '#7CFFCB', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 20 },
});
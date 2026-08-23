import React, { useMemo, useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Polyline } from 'react-native-svg';
import colors from '@/constants/colors';

const c = colors.light;
type Category = 'Market Edge' | 'Psychology';
const EDGES = {
  'Market Edge': [
    ['TREND FOLLOWING', 'Wait for the H4 candle to close. Amateurs trade the wick; professionals trade the close.'],
    ['RISK FIRST', 'A smaller position keeps you in the game long enough for your edge to compound.'],
    ['PRICE ACTION', 'Let price prove the thesis. Conviction is not confirmation; structure is.'],
  ],
  Psychology: [
    ['DISCIPLINE OVER IMPULSE', 'Your best trade may be the one you had the discipline to leave alone.'],
    ['PROCESS OVER OUTCOME', 'Judge the quality of your decision, not the result of a single trade.'],
    ['THE PATIENCE EDGE', 'Clarity arrives when you stop forcing the market to agree with you.'],
  ],
} as const;

export default function QuotesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<Category>('Market Edge');
  const [index, setIndex] = useState(0);
  const quote = EDGES[category][index % EDGES[category].length];
  const date = useMemo(() => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()), []);
  const next = () => setIndex((value) => (value + 1) % EDGES[category].length);
  const share = async () => {
    const message = `✦ DAILY EDGE\n${quote[0]}\n\n“${quote[1]}”\n\n— TradiQs Oracle • ${date}`;
    if (Platform.OS === 'web') window.alert(message);
    else await Share.share({ message });
  };
  const save = () => Platform.OS === 'web'
    ? window.alert('Image saving is not available in preview yet. Use Share to save this Oracle Card.')
    : Alert.alert('Save Image', 'Image saving is not available yet. Use Share to save this Oracle Card.');
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}><View><Text style={styles.kicker}>TRADIQS AI</Text><Text style={styles.title}>Daily Oracle</Text></View><TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close"><Feather name="x" size={23} color={c.foreground} /></TouchableOpacity></View>
      <View style={styles.tabs}>{(['Market Edge', 'Psychology'] as Category[]).map((item) => <TouchableOpacity key={item} onPress={() => { setCategory(item); setIndex(0); }} style={[styles.tab, category === item && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: category === item }}><Text style={[styles.tabText, category === item && styles.tabTextActive]}>{item}</Text></TouchableOpacity>)}</View>
      <View style={styles.oracleCard} collapsable={false}>
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 400 560">
          {[80, 160, 240, 320, 400, 480].map((y) => <Line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="#00F0FF" strokeWidth="1" opacity=".08" />)}
          {[40, 120, 200, 280, 360].map((x) => <Line key={`v${x}`} x1={x} y1="0" x2={x} y2="560" stroke="#00F0FF" strokeWidth="1" opacity=".08" />)}
          <Polyline points="0,430 55,380 90,400 145,280 190,320 235,205 285,240 330,130 400,160" fill="none" stroke="#00F0FF" strokeWidth="2" opacity=".08" />
        </Svg>
        <View style={styles.cardContent}>
          <View style={styles.badge}><Text style={styles.badgeDiamond}>✦</Text><Text style={styles.badgeText}>DAILY EDGE</Text></View>
          <Text style={styles.topic}>{quote[0].split('').join(' ')}</Text>
          <Text style={styles.openQuote}>“</Text>
          <Text style={styles.quote}>{quote[1]}</Text>
          <Text style={styles.closeQuote}>”</Text>
          <View style={[styles.insight, category === 'Psychology' && styles.insightGold]}><Text style={styles.insightTitle}>Oracle's Insight:</Text><Text style={styles.insightText}>{quote[1]}</Text></View>
          <View style={styles.attribution}><Text style={styles.credit}>— TradiQs Oracle • {date}</Text><Text style={styles.brand}>• TradiQs AI | tradiqs.com</Text></View>
        </View>
      </View>
      <View style={styles.actions}><TouchableOpacity style={styles.action} onPress={save} accessibilityRole="button" accessibilityLabel="Save Oracle Card image"><Feather name="download" size={16} color={c.primary} /><Text style={styles.actionText}>Save Image</Text></TouchableOpacity><TouchableOpacity style={styles.action} onPress={share} accessibilityRole="button" accessibilityLabel="Share Oracle Card"><Feather name="share-2" size={16} color={c.primary} /><Text style={styles.actionText}>Share</Text></TouchableOpacity></View>
      <TouchableOpacity style={styles.generate} onPress={next} accessibilityRole="button" accessibilityLabel="Generate new edge"><Feather name="refresh-cw" size={16} color={c.primaryForeground} /><Text style={styles.generateText}>Generate New Edge</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, padding: 18, paddingTop: 54 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: c.primary, fontSize: 9, letterSpacing: 2, fontFamily: 'Inter_700Bold' },
  title: { color: c.foreground, fontSize: 25, fontFamily: 'Inter_700Bold', marginTop: 3 },
  tabs: { flexDirection: 'row', backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 9, padding: 3, marginTop: 22 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 6 },
  tabActive: { backgroundColor: c.primary },
  tabText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tabTextActive: { color: c.primaryForeground },
  oracleCard: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, marginTop: 16, overflow: 'hidden' },
  cardContent: { padding: 22, minHeight: 485, alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: '#C9A227', borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  badgeDiamond: { color: '#E6C65C', fontSize: 13 }, badgeText: { color: '#E6C65C', fontSize: 9, letterSpacing: 1.7, fontFamily: 'Inter_700Bold' },
  topic: { color: c.foreground, fontSize: 15, letterSpacing: 2.3, fontFamily: 'Inter_700Bold', marginTop: 25, textAlign: 'center' },
  openQuote: { color: c.primary, fontSize: 54, lineHeight: 48, alignSelf: 'flex-start', marginTop: 19, height: 35, fontFamily: 'Georgia' },
  quote: { color: c.foreground, fontSize: 23, lineHeight: 33, textAlign: 'center', fontFamily: 'Inter_600SemiBold', marginHorizontal: 4 },
  closeQuote: { color: c.primary, fontSize: 54, lineHeight: 40, alignSelf: 'flex-end', height: 37, fontFamily: 'Georgia' },
  insight: { width: '100%', backgroundColor: c.background, borderLeftColor: c.primary, borderLeftWidth: 2, padding: 13, marginTop: 11 },
  insightGold: { borderLeftColor: '#E6C65C' },
  insightTitle: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  insightText: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  attribution: { alignItems: 'center', marginTop: 'auto', paddingTop: 20 },
  credit: { color: c.mutedForeground, fontSize: 11 }, brand: { color: '#4F555E', fontSize: 10, marginTop: 7, letterSpacing: .5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, borderColor: c.border, borderWidth: 1, borderRadius: 8, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  actionText: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  generate: { backgroundColor: c.primary, borderRadius: 8, paddingVertical: 15, marginTop: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  generateText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 13 },
});
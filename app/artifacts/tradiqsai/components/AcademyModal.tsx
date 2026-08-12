import React, { useMemo, useState } from 'react';
import {
  Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

const c = colors.light;
type Props = { visible: boolean; onClose: () => void };
type Detail = { title: string; definition: string; example: string; bullets: string[] };
type Module = { id: string; number: string; title: string; lessons: string[] };

const masterclasses = [
  { title: 'Beginner Bootcamp', detail: 'Build the foundation', color: '#183C4B' },
  { title: 'Mastering AI Signals', detail: 'Read confluence clearly', color: '#30224B' },
  { title: 'AutoPilot Oracle Setup', detail: 'Automate with guardrails', color: '#19463E' },
];
const curriculum: Module[] = [
  { id: 'trading', number: '01', title: 'Trading 101', lessons: ['Candlestick Anatomy', 'Chart Reading', 'How to Buy & Sell'] },
  { id: 'signals', number: '02', title: 'TradiQs AI Signals', lessons: ['Reading the Feed', 'Confluence', 'Entry/Exit Rules'] },
  { id: 'oracle', number: '03', title: 'The AI Oracle', lessons: ['BrokerSync Connection', 'AutoPilot Allocation', 'Risk Guardrails'] },
  { id: 'risk', number: '04', title: 'Risk Management & Psychology', lessons: ['Position Sizing', 'Stop Loss Rules', 'FOMO Control'] },
  { id: 'patterns', number: '05', title: 'Chart Patterns & Technical Analysis', lessons: ['Support & Resistance', 'Trendlines', 'Reversal Patterns'] },
];
const detailFor = (title: string): Detail => ({
  title,
  definition: `Master ${title.toLowerCase()} by combining a clear process with repeatable risk controls.`,
  bullets: [
    'Start with context: timeframe, market structure, and liquidity.',
    'Wait for confirmation instead of forcing a setup.',
    'Record the decision so the next review is objective.',
  ],
  example: `Practical example: mark the relevant ${title.toLowerCase()} on your chart, define invalidation first, then size the trade around the risk you can afford.`,
});
const dictionary: Detail[] = [
  ['Pip', 'The smallest standard price movement in a currency pair.'],
  ['Lot Size', 'The number of currency units in a trade position.'],
  ['Spread', 'The difference between the bid and ask price.'],
  ['Order Block', 'A price zone where significant institutional orders accumulated.'],
  ['Liquidity', 'Available orders that allow a market to absorb buying or selling.'],
  ['Bullish', 'A market condition or view that expects prices to rise.'],
  ['Bearish', 'A market condition or view that expects prices to fall.'],
  ['FVG', 'Fair Value Gap: an imbalance between candles that price may revisit.'],
  ['Leverage', 'A multiplier that increases market exposure relative to deposited capital.'],
  ['Slippage', 'The difference between the requested execution price and filled price.'],
  ['Margin', 'Capital reserved by the broker to keep a leveraged position open.'],
].map(([title, definition]) => ({ title, definition, example: `Example: use ${title.toLowerCase()} as an input to your plan, not as a reason to remove your risk limit.`, bullets: ['Define it before entering.', 'Compare it with the broader setup.', 'Review its effect after the trade.'] }));

const tools = ['Lot Size Calculator', 'P/L Simulator', 'Risk/Reward Planner', 'Margin Calculator'];
const money = (n: number) => Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';
const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <TextInput value={value} onChangeText={onChange} placeholder={label} placeholderTextColor={c.mutedForeground} keyboardType="numeric" style={styles.input} />
);

export function AcademyModal({ visible, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>('trading');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLesson, setSelectedLesson] = useState<Detail | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<Detail | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string[]>([]);
  const set = (key: string) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const value = (key: string) => values[key] ?? '';
  const filteredTerms = useMemo(() => dictionary.filter((term) => `${term.title} ${term.definition}`.toLowerCase().includes(searchTerm.trim().toLowerCase())), [searchTerm]);

  const calculate = () => {
    const n = (key: string) => Number(value(key));
    if (activeTool === 'Lot Size Calculator') {
      const lots = n('balance') > 0 && n('risk') > 0 && n('stop') > 0 ? (n('balance') * n('risk') / 100) / (n('stop') * 10) : NaN;
      setResult([`Recommended lot size: ${Number.isFinite(lots) ? lots.toFixed(2) : 'enter valid values'}`]);
    } else if (activeTool === 'P/L Simulator') {
      const unit = n('lot') * 100000; const profit = Math.abs(n('tp') - n('entry')) * unit; const loss = Math.abs(n('entry') - n('sl')) * unit;
      setResult([`Expected profit: ${money(profit)}`, `Expected loss: ${money(loss)}`, `Risk / reward: ${loss > 0 ? (profit / loss).toFixed(2) : '—'}R`]);
    } else if (activeTool === 'Risk/Reward Planner') {
      const expectancy = (n('winrate') / 100 * n('rr')) - (1 - n('winrate') / 100);
      setResult([`10-trade expectancy: ${Number.isFinite(expectancy) ? `${(expectancy * 10).toFixed(2)}R` : 'enter valid values'}`, `Model assumes 1R risk per trade.`]);
    } else {
      const margin = n('size') > 0 && n('leverage') > 0 ? n('size') / n('leverage') : NaN;
      setResult([`Required margin: ${money(margin)}`]);
    }
  };
  const closeDetail = () => { setSelectedLesson(null); setSelectedTerm(null); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>TRADIQS ACADEMY</Text><Text style={styles.title}>Build your edge.</Text></View><TouchableOpacity onPress={onClose} testID="academy-close" style={styles.close}><Feather name="x" size={24} color={c.foreground} /></TouchableOpacity></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hud}><Text style={styles.hudLabel}>DAILY ALPHA MINDSET</Text><Text style={styles.quote}>“Amateurs focus on how much they can make. Professionals focus on how much they can lose.”</Text></View>
          <Text style={styles.section}>YOUTUBE MASTERCLASSES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{masterclasses.map((video) => <TouchableOpacity key={video.title} style={[styles.videoCard, { backgroundColor: video.color }]} onPress={() => Linking.openURL('https://www.youtube.com/@tradiqsai')} activeOpacity={0.85}><View style={styles.thumbnail}><Feather name="play-circle" size={30} color={c.accent} /></View><Text style={styles.videoTitle}>{video.title}</Text><Text style={styles.videoDetail}>{video.detail}</Text><Text style={styles.videoMeta}>WATCH ON YOUTUBE  ›</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.section}>STRUCTURED CURRICULUM</Text>
          {curriculum.map((module) => { const isOpen = expanded === module.id; return <View key={module.id} style={styles.module}><TouchableOpacity style={styles.moduleHeader} onPress={() => setExpanded(isOpen ? null : module.id)}><View style={styles.moduleNumber}><Text style={styles.moduleNumberText}>{module.number}</Text></View><Text style={styles.moduleTitle}>{module.title}</Text><Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.accent} /></TouchableOpacity>{isOpen && <View style={styles.lessons}>{module.lessons.map((lesson, index) => <TouchableOpacity key={lesson} style={styles.lesson} onPress={() => setSelectedLesson(detailFor(lesson))}><Text style={styles.lessonNumber}>0{index + 1}</Text><Text style={styles.lessonText}>{lesson}</Text><Feather name="arrow-up-right" size={15} color={c.mutedForeground} /></TouchableOpacity>)}</View>}</View>; })}
          <Text style={styles.section}>TRADING DICTIONARY</Text>
          <TextInput value={searchTerm} onChangeText={setSearchTerm} placeholder="Search terms..." placeholderTextColor={c.mutedForeground} style={styles.search} />
          {filteredTerms.map((term) => <TouchableOpacity key={term.title} style={styles.termCard} onPress={() => setSelectedTerm(term)}><Text style={styles.term}>{term.title}</Text><Text style={styles.definition}>{term.definition}</Text></TouchableOpacity>)}
          {!filteredTerms.length && <Text style={styles.empty}>No terms match your search.</Text>}
          <Text style={styles.section}>TRADER&apos;S TOOLKIT</Text>
          <View style={styles.toolGrid}>{tools.map((tool) => <TouchableOpacity key={tool} style={styles.toolCard} onPress={() => { setActiveTool(tool); setResult([]); }}><Feather name="sliders" size={20} color={c.accent} /><Text style={styles.toolTitle}>{tool}</Text><Feather name="arrow-up-right" size={16} color={c.mutedForeground} /></TouchableOpacity>)}</View>
        </ScrollView>
      </View>
      <Modal visible={Boolean(selectedLesson || selectedTerm)} animationType="slide" onRequestClose={closeDetail}><View style={styles.detailModal}><ScrollView contentContainerStyle={styles.detailContent}>{(selectedLesson || selectedTerm) && <><Text style={styles.eyebrow}>ACADEMY LESSON</Text><Text style={styles.detailTitle}>{(selectedLesson || selectedTerm)?.title}</Text><Text style={styles.detailDefinition}>{(selectedLesson || selectedTerm)?.definition}</Text><Text style={styles.subheading}>KEY POINTS</Text>{(selectedLesson || selectedTerm)?.bullets.map((bullet) => <Text key={bullet} style={styles.bullet}>•  {bullet}</Text>)}<Text style={styles.subheading}>PRACTICAL EXAMPLE</Text><Text style={styles.detailDefinition}>{(selectedLesson || selectedTerm)?.example}</Text><TouchableOpacity style={styles.primaryButton} onPress={closeDetail}><Text style={styles.primaryText}>CLOSE LESSON</Text></TouchableOpacity></>}</ScrollView></View></Modal>
      <Modal visible={Boolean(activeTool)} animationType="slide" onRequestClose={() => setActiveTool(null)}><ScrollView contentContainerStyle={styles.calculator}><TouchableOpacity style={styles.modalClose} onPress={() => setActiveTool(null)}><Feather name="x" size={23} color={c.foreground} /></TouchableOpacity><Text style={styles.detailTitle}>{activeTool}</Text>{activeTool === 'Lot Size Calculator' && <><Field label="Account Balance ($)" value={value('balance')} onChange={set('balance')} /><Field label="Risk (%)" value={value('risk')} onChange={set('risk')} /><Field label="Stop Loss Pips" value={value('stop')} onChange={set('stop')} /></>}{activeTool === 'P/L Simulator' && <><Field label="Entry Price" value={value('entry')} onChange={set('entry')} /><Field label="Take Profit Price" value={value('tp')} onChange={set('tp')} /><Field label="Stop Loss Price" value={value('sl')} onChange={set('sl')} /><Field label="Lot Size" value={value('lot')} onChange={set('lot')} /></>}{activeTool === 'Risk/Reward Planner' && <><Field label="Win Rate (%)" value={value('winrate')} onChange={set('winrate')} /><Field label="Risk : Reward Ratio" value={value('rr')} onChange={set('rr')} /></>}{activeTool === 'Margin Calculator' && <><Field label="Leverage (e.g. 50)" value={value('leverage')} onChange={set('leverage')} /><Field label="Trade Size ($)" value={value('size')} onChange={set('size')} /></>}<TouchableOpacity style={styles.primaryButton} onPress={calculate}><Text style={styles.primaryText}>CALCULATE</Text></TouchableOpacity>{result.map((line) => <Text key={line} style={styles.result}>{line}</Text>)}</ScrollView></Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 54 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: c.border },
  close: { padding: 5 }, eyebrow: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.6 }, title: { color: c.foreground, fontSize: 26, fontFamily: 'Inter_700Bold', marginTop: 6 }, content: { padding: 20, paddingBottom: 50 },
  hud: { backgroundColor: c.card, borderLeftWidth: 3, borderLeftColor: c.accent, borderRadius: 11, padding: 15 }, hudLabel: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 }, quote: { color: c.foreground, fontSize: 13, lineHeight: 19, marginTop: 8 },
  section: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginTop: 27, marginBottom: 11 }, videoCard: { width: 224, height: 166, borderRadius: 13, padding: 15, marginRight: 12, justifyContent: 'flex-end' }, thumbnail: { position: 'absolute', top: 16, left: 16, right: 16, height: 68, borderRadius: 9, backgroundColor: '#0005', alignItems: 'center', justifyContent: 'center' }, videoTitle: { color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }, videoDetail: { color: '#C0C8D2', fontSize: 11, marginTop: 5 }, videoMeta: { color: c.accent, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 12 },
  module: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, marginBottom: 9, overflow: 'hidden' }, moduleHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 }, moduleNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#20262D', alignItems: 'center', justifyContent: 'center' }, moduleNumberText: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold' }, moduleTitle: { flex: 1, color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }, lessons: { borderTopWidth: 1, borderTopColor: c.border, padding: 8 }, lesson: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 }, lessonNumber: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', width: 22 }, lessonText: { flex: 1, color: c.foreground, fontSize: 12, fontFamily: 'Inter_500Medium' },
  search: { backgroundColor: '#12141A', color: c.foreground, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, fontSize: 13, marginBottom: 10 }, termCard: { backgroundColor: c.card, borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: c.accent }, term: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }, definition: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 5 }, empty: { color: c.mutedForeground, fontSize: 12, paddingVertical: 12 }, toolGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, toolCard: { width: '48%', minHeight: 112, backgroundColor: c.card, borderWidth: 1, borderColor: '#35414A', borderRadius: 12, padding: 14, justifyContent: 'space-between' }, toolTitle: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_700Bold', lineHeight: 18 },
  detailModal: { flex: 1, backgroundColor: c.background, paddingTop: 58 }, detailContent: { padding: 24, paddingBottom: 50 }, detailTitle: { color: c.foreground, fontSize: 27, fontFamily: 'Inter_700Bold', marginTop: 10, marginBottom: 16 }, detailDefinition: { color: c.foreground, fontSize: 15, lineHeight: 23 }, subheading: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginTop: 28, marginBottom: 10 }, bullet: { color: c.mutedForeground, fontSize: 14, lineHeight: 22, marginBottom: 8 }, primaryButton: { backgroundColor: c.accent, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 30 }, primaryText: { color: '#061014', fontFamily: 'Inter_700Bold', letterSpacing: 1 }, calculator: { flexGrow: 1, backgroundColor: c.background, padding: 24, paddingTop: 58 }, modalClose: { alignSelf: 'flex-end', padding: 5 }, input: { backgroundColor: '#12141A', color: c.foreground, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, marginTop: 10, fontSize: 14 }, result: { color: '#7CFFCB', fontSize: 16, fontFamily: 'Inter_700Bold', marginTop: 14 },
});
import React, { useMemo, useState } from 'react';
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
import colors from '@/constants/colors';

const c = colors.light;

type Props = { visible: boolean; onClose: () => void };
type Term = { title: string; definition: string };

const masterclasses = [
  { title: 'Beginner Bootcamp', detail: 'Build the foundation', color: '#183C4B' },
  { title: 'Mastering AI Signals', detail: 'Read confluence clearly', color: '#30224B' },
  { title: 'AutoPilot Oracle Setup', detail: 'Automate with guardrails', color: '#19463E' },
];

const curriculum = [
  { id: 'trading', number: '01', title: 'Trading 101', lessons: ['Candlestick Anatomy', 'Chart Reading', 'How to Buy & Sell'] },
  { id: 'signals', number: '02', title: 'TradiQs AI Signals', lessons: ['Reading the Feed', 'Confluence', 'Entry/Exit Rules'] },
  { id: 'oracle', number: '03', title: 'The AI Oracle', lessons: ['BrokerSync Connection', 'AutoPilot Allocation', 'Risk Guardrails'] },
];

const terms: Term[] = [
  { title: 'Pip', definition: 'The smallest standard price movement in a currency pair.' },
  { title: 'Lot Size', definition: 'The number of currency units in a trade position.' },
  { title: 'Spread', definition: 'The difference between the bid and ask price.' },
  { title: 'Order Block', definition: 'A price zone where significant institutional orders accumulated.' },
  { title: 'Liquidity', definition: 'Available orders that allow a market to absorb buying or selling.' },
  { title: 'Bullish', definition: 'A market condition or view that expects prices to rise.' },
  { title: 'Bearish', definition: 'A market condition or view that expects prices to fall.' },
  { title: 'FVG', definition: 'Fair Value Gap: an imbalance between candles that price may revisit.' },
];

const tools = ['Lot Size Calculator', 'P/L Simulator', 'Risk/Reward Planner', 'Margin Calculator'];

export function AcademyModal({ visible, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>('trading');
  const [query, setQuery] = useState('');
  const filteredTerms = useMemo(() => {
    const search = query.trim().toLowerCase();
    return terms.filter((term) => `${term.title} ${term.definition}`.toLowerCase().includes(search));
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>TRADIQS ACADEMY</Text>
            <Text style={styles.title}>Build your edge.</Text>
          </View>
          <TouchableOpacity onPress={onClose} testID="academy-close" style={styles.close}>
            <Feather name="x" size={24} color={c.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hud}>
            <Text style={styles.hudLabel}>DAILY ALPHA MINDSET</Text>
            <Text style={styles.quote}>“Amateurs focus on how much they can make. Professionals focus on how much they can lose.”</Text>
          </View>

          <Text style={styles.section}>YOUTUBE MASTERCLASSES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {masterclasses.map((video) => (
              <TouchableOpacity key={video.title} style={[styles.videoCard, { backgroundColor: video.color }]} onPress={() => Linking.openURL('https://youtube.com')} activeOpacity={0.85}>
                <View style={styles.thumbnail}><Feather name="play-circle" size={30} color={c.accent} /></View>
                <Text style={styles.videoTitle}>{video.title}</Text>
                <Text style={styles.videoDetail}>{video.detail}</Text>
                <Text style={styles.videoMeta}>WATCH ON YOUTUBE  ›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.section}>STRUCTURED CURRICULUM</Text>
          {curriculum.map((module) => {
            const isOpen = expanded === module.id;
            return (
              <View key={module.id} style={styles.module}>
                <TouchableOpacity style={styles.moduleHeader} onPress={() => setExpanded(isOpen ? null : module.id)} activeOpacity={0.8}>
                  <View style={styles.moduleNumber}><Text style={styles.moduleNumberText}>{module.number}</Text></View>
                  <Text style={styles.moduleTitle}>{module.title}</Text>
                  <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.accent} />
                </TouchableOpacity>
                {isOpen && <View style={styles.lessons}>{module.lessons.map((lesson, index) => (
                  <View key={lesson} style={styles.lesson}><Text style={styles.lessonNumber}>0{index + 1}</Text><Text style={styles.lessonText}>{lesson}</Text><Feather name="arrow-up-right" size={15} color={c.mutedForeground} /></View>
                ))}</View>}
              </View>
            );
          })}

          <Text style={styles.section}>TRADING DICTIONARY</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search terms..." placeholderTextColor={c.mutedForeground} style={styles.search} />
          {filteredTerms.map((term) => <View key={term.title} style={styles.termCard}><Text style={styles.term}>{term.title}</Text><Text style={styles.definition}>{term.definition}</Text></View>)}
          {!filteredTerms.length && <Text style={styles.empty}>No terms match your search.</Text>}

          <Text style={styles.section}>TRADER&apos;S TOOLKIT</Text>
          <View style={styles.toolGrid}>
            {tools.map((tool) => <TouchableOpacity key={tool} style={styles.toolCard} activeOpacity={0.8}><Feather name="sliders" size={20} color={c.accent} /><Text style={styles.toolTitle}>{tool}</Text><Feather name="arrow-up-right" size={16} color={c.mutedForeground} /></TouchableOpacity>)}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 54 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: c.border },
  close: { padding: 5 },
  eyebrow: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.6 },
  title: { color: c.foreground, fontSize: 26, fontFamily: 'Inter_700Bold', marginTop: 6 },
  content: { padding: 20, paddingBottom: 50 },
  hud: { backgroundColor: c.card, borderLeftWidth: 3, borderLeftColor: c.accent, borderRadius: 11, padding: 15 },
  hudLabel: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  quote: { color: c.foreground, fontSize: 13, lineHeight: 19, marginTop: 8 },
  section: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginTop: 27, marginBottom: 11 },
  videoCard: { width: 224, height: 166, borderRadius: 13, padding: 15, marginRight: 12, justifyContent: 'flex-end' },
  thumbnail: { position: 'absolute', top: 16, left: 16, right: 16, height: 68, borderRadius: 9, backgroundColor: '#0005', alignItems: 'center', justifyContent: 'center' },
  videoTitle: { color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' },
  videoDetail: { color: '#C0C8D2', fontSize: 11, marginTop: 5 },
  videoMeta: { color: c.accent, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 12 },
  module: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, marginBottom: 9, overflow: 'hidden' },
  moduleHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  moduleNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#20262D', alignItems: 'center', justifyContent: 'center' },
  moduleNumberText: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold' },
  moduleTitle: { flex: 1, color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' },
  lessons: { borderTopWidth: 1, borderTopColor: c.border, padding: 8 },
  lesson: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  lessonNumber: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', width: 22 },
  lessonText: { flex: 1, color: c.foreground, fontSize: 12, fontFamily: 'Inter_500Medium' },
  search: { backgroundColor: '#12141A', color: c.foreground, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, fontSize: 13, marginBottom: 10 },
  termCard: { backgroundColor: c.card, borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: c.accent },
  term: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' },
  definition: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 5 },
  empty: { color: c.mutedForeground, fontSize: 12, paddingVertical: 12 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  toolCard: { width: '48%', minHeight: 112, backgroundColor: c.card, borderWidth: 1, borderColor: '#35414A', borderRadius: 12, padding: 14, justifyContent: 'space-between' },
  toolTitle: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_700Bold', lineHeight: 18 },
});
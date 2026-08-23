import React, { useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';

const COLORS = {
  background: '#0A0B0E',
  card: '#16181D',
  input: '#12141A',
  accent: '#00F0FF',
  text: '#FFFFFF',
  muted: '#8A919D',
  border: '#2A3038',
};

const masterclasses = [
  { title: 'Beginner Bootcamp', subtitle: 'Build the foundation', color: '#183C4B' },
  { title: 'Mastering AI Signals', subtitle: 'Read confluence clearly', color: '#30224B' },
  { title: 'AutoPilot Oracle Setup', subtitle: 'Automate with guardrails', color: '#19463E' },
];

const curriculum = [
  { id: 'trading-101', title: 'Trading 101', lessons: ['Candlestick Anatomy', 'Chart Reading', 'How to Buy & Sell'] },
  { id: 'signals', title: 'TradiQs AI Signals', lessons: ['Reading the Feed', 'Confluence', 'Entry/Exit Rules'] },
  { id: 'oracle', title: 'The AI Oracle', lessons: ['BrokerSync Connection', 'AutoPilot Allocation', 'Risk Guardrails'] },
];

const dictionary = [
  ['Pip', 'The smallest standard price movement in a currency pair.'],
  ['Lot Size', 'The number of currency units in a trade position.'],
  ['Spread', 'The difference between the bid and ask price.'],
  ['Order Block', 'A price zone where significant institutional orders accumulated.'],
  ['Liquidity', 'Available orders that allow a market to absorb buying or selling.'],
  ['Bullish', 'A market condition or view that expects prices to rise.'],
  ['Bearish', 'A market condition or view that expects prices to fall.'],
  ['FVG', 'Fair Value Gap: an imbalance between candles that price may revisit.'],
].map(([title, definition], index) => ({ id: String(index), title, definition }));

const tools = ['Lot Size Calculator', 'P/L Simulator', 'Risk/Reward Planner', 'Margin Calculator'];

export default function AppGuideScreen() {
  const [expandedModule, setExpandedModule] = useState<string | null>('trading-101');
  const [query, setQuery] = useState('');

  const filteredDictionary = useMemo(() => {
    const search = query.trim().toLowerCase();
    return dictionary.filter(({ title, definition }) =>
      `${title} ${definition}`.toLowerCase().includes(search),
    );
  }, [query]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'TradiQs Academy',
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>TRADIQS ACADEMY</Text>
        <Text style={styles.title}>Build your edge.</Text>
        <Text style={styles.intro}>A practical learning hub for sharper decisions in every market.</Text>

        <Text style={styles.section}>YOUTUBE MASTERCLASSES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {masterclasses.map((video) => (
            <TouchableOpacity
              key={video.title}
              style={[styles.videoCard, { backgroundColor: video.color }]}
              onPress={() => Linking.openURL('https://youtube.com')}
              activeOpacity={0.85}
            >
              <Feather name="play-circle" size={34} color={COLORS.accent} />
              <Text style={styles.videoTitle}>{video.title}</Text>
              <Text style={styles.videoSubtitle}>{video.subtitle}</Text>
              <Text style={styles.videoMeta}>WATCH ON YOUTUBE  ›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.section}>STRUCTURED CURRICULUM</Text>
        {curriculum.map((module) => {
          const isOpen = expandedModule === module.id;
          return (
            <View key={module.id} style={styles.moduleCard}>
              <TouchableOpacity
                style={styles.moduleHeader}
                onPress={() => setExpandedModule(isOpen ? null : module.id)}
                activeOpacity={0.8}
              >
                <View style={styles.moduleIndex}><Text style={styles.moduleIndexText}>{module.id === 'trading-101' ? '01' : module.id === 'signals' ? '02' : '03'}</Text></View>
                <Text style={styles.moduleTitle}>{module.title}</Text>
                <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.accent} />
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.lessonList}>
                  {module.lessons.map((lesson, index) => (
                    <View key={lesson} style={styles.lesson}>
                      <Text style={styles.lessonNumber}>0{index + 1}</Text>
                      <Text style={styles.lessonText}>{lesson}</Text>
                      <Feather name="arrow-up-right" size={15} color={COLORS.muted} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.section}>TRADING DICTIONARY</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search terms..."
          placeholderTextColor={COLORS.muted}
          style={styles.search}
        />
        {filteredDictionary.map((term) => (
          <View key={term.id} style={styles.dictionaryCard}>
            <Text style={styles.term}>{term.title}</Text>
            <Text style={styles.definition}>{term.definition}</Text>
          </View>
        ))}
        {!filteredDictionary.length && <Text style={styles.empty}>No terms match your search.</Text>}

        <Text style={styles.section}>TRADER&apos;S TOOLKIT</Text>
        <View style={styles.toolGrid}>
          {tools.map((tool) => (
            <TouchableOpacity key={tool} style={styles.toolCard} activeOpacity={0.8}>
              <Feather name="sliders" size={20} color={COLORS.accent} />
              <Text style={styles.toolTitle}>{tool}</Text>
              <Feather name="arrow-up-right" size={16} color={COLORS.muted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 50 },
  eyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginTop: 8 },
  intro: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 8, maxWidth: 330 },
  section: { color: '#6D727B', fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginTop: 28, marginBottom: 11 },
  videoCard: { width: 226, height: 164, borderRadius: 14, padding: 16, marginRight: 12, justifyContent: 'flex-end' },
  videoTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginTop: 22 },
  videoSubtitle: { color: '#C0C8D2', fontSize: 11, marginTop: 5 },
  videoMeta: { color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 13 },
  moduleCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, marginBottom: 9, overflow: 'hidden' },
  moduleHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  moduleIndex: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#20262D', alignItems: 'center', justifyContent: 'center' },
  moduleIndexText: { color: COLORS.accent, fontSize: 10, fontWeight: '800' },
  moduleTitle: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '800' },
  lessonList: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 8 },
  lesson: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  lessonNumber: { color: COLORS.accent, fontSize: 10, fontWeight: '800', width: 22 },
  lessonText: { flex: 1, color: '#D8DCE2', fontSize: 12 },
  search: { backgroundColor: COLORS.input, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, fontSize: 13, marginBottom: 10 },
  dictionaryCard: { backgroundColor: COLORS.card, borderRadius: 11, padding: 14, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: COLORS.accent },
  term: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  definition: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  empty: { color: COLORS.muted, fontSize: 12, paddingVertical: 12 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  toolCard: { width: '48%', minHeight: 112, backgroundColor: COLORS.card, borderWidth: 1, borderColor: '#35414A', borderRadius: 13, padding: 14, justifyContent: 'space-between' },
  toolTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', lineHeight: 18 },
});
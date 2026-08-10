import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

const c = colors.light;
const ARTICLES = [
  ['Mastering 15m Liquidity Order Blocks with TradiQs AI', 'Strategy', '4 min read', 'Learn how to mark the last opposing candle before an impulsive move, then use liquidity sweeps and displacement to build a cleaner 15-minute setup.'],
  ['Navigating High-Impact News Events (NFP & CPI)', 'Market Analysis', '5 min read', 'News can expand spreads and invalidate otherwise good technical setups. Review the release calendar, reduce exposure, and wait for price discovery before acting.'],
  ['How the AutoPilot Risk Engine Protects Your Drawdown', 'Risk Management', '3 min read', 'AutoPilot is designed around capital preservation: position sizing, daily limits, and stop discipline work together to keep one trade from defining your account.'],
] as const;

export function LatestInsightsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close latest insights">
            <Feather name="x" size={23} color={c.foreground} />
          </TouchableOpacity>
          <Text style={styles.title}>Latest Insights</Text>
          <Feather name="book-open" size={20} color={c.primary} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>Free strategies, AI signal reviews & market analysis</Text>
          {ARTICLES.map(([title, category, time, body], index) => (
            <View key={title} style={styles.article}>
              <View style={styles.articleTop}><Text style={styles.category}>{category}</Text><Text style={styles.time}>{time}</Text></View>
              <Text style={styles.articleTitle}>{title}</Text>
              <TouchableOpacity onPress={() => setExpanded(expanded === index ? null : index)} accessibilityRole="button" accessibilityLabel={`${expanded === index ? 'Collapse' : 'Read'} ${title}`}>
                <Text style={styles.read}>{expanded === index ? 'COLLAPSE ARTICLE' : 'READ ARTICLE'} <Feather name={expanded === index ? 'chevron-up' : 'chevron-down'} size={13} color={c.primary} /></Text>
              </TouchableOpacity>
              {expanded === index && <Text style={styles.body}>{body}</Text>}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { padding: 18, paddingTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.foreground, fontSize: 20, fontFamily: 'Inter_700Bold' },
  content: { padding: 18, gap: 14 },
  intro: { color: c.mutedForeground, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  article: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  articleTop: { flexDirection: 'row', justifyContent: 'space-between' },
  category: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  time: { color: c.mutedForeground, fontSize: 10 },
  articleTitle: { color: c.foreground, fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  read: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .7 },
  body: { color: c.mutedForeground, fontSize: 13, lineHeight: 20, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
});
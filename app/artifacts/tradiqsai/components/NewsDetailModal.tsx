import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import type { MarketNews } from '@/services/supabaseService';

type Props = {
  article: MarketNews | null;
  onClose: () => void;
  onTrade: () => void;
};

const sentimentColor = (sentiment: MarketNews['sentiment']) =>
  sentiment === 'Bullish' ? '#21D99B' : sentiment === 'Bearish' ? '#FF6174' : '#8A929D';

export function NewsDetailModal({ article, onClose, onTrade }: Props) {
  const [showSource, setShowSource] = useState(false);
  if (!article) return null;
  const color = sentimentColor(article.sentiment);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{article.category.toUpperCase()} MARKET BRIEF</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close news detail" style={styles.close}>
              <Feather name="x" size={20} color="#F4F7FB" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.headline}>{article.headline}</Text>
            <View style={[styles.badge, { borderColor: `${color}77`, backgroundColor: `${color}18` }]}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.badgeText, { color }]}>{article.sentiment.toUpperCase()}</Text>
            </View>
            <View style={styles.summary}>
              <View style={styles.summaryHeader}>
                <Feather name="cpu" size={15} color="#00E5FF" />
                <Text style={styles.summaryLabel}>TRADIQS AI TAKE</Text>
              </View>
              <Text style={styles.summaryText}>{article.ai_summary}</Text>
            </View>
            {showSource ? (
              <View style={styles.sourceFrame}>
                {Platform.OS === 'web'
                  ? React.createElement('iframe', { src: article.url, title: article.headline, style: styles.iframe as any })
                  : <WebView source={{ uri: article.url }} style={styles.webview} />}
              </View>
            ) : (
              <Pressable onPress={() => setShowSource(true)} accessibilityRole="link" accessibilityLabel="Read full article in app">
                <Text style={styles.sourceLink}>Read Full Article <Text style={styles.arrow}>›</Text></Text>
              </Pressable>
            )}
          </ScrollView>
          <Pressable onPress={onTrade} style={styles.tradeButton} accessibilityRole="button" accessibilityLabel="Trade impacted asset">
            <Feather name="trending-up" size={18} color="#061014" />
            <Text style={styles.tradeText}>TRADE IMPACTED ASSET</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.66)' },
  sheet: { maxHeight: '90%', minHeight: 430, backgroundColor: '#101218', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2C323D', paddingHorizontal: 20, paddingBottom: 20 },
  handle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#3C4350', alignSelf: 'center', marginVertical: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#00E5FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#1C2028' },
  content: { gap: 16, paddingTop: 12, paddingBottom: 18 },
  headline: { color: '#F4F7FB', fontSize: 23, lineHeight: 30, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summary: { gap: 10, borderWidth: 1, borderColor: 'rgba(0,229,255,0.32)', borderRadius: 14, backgroundColor: 'rgba(0,229,255,0.07)', padding: 15 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  summaryLabel: { color: '#00E5FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  summaryText: { color: '#D9E0E9', fontSize: 14, lineHeight: 21 },
  sourceLink: { color: '#00E5FF', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  arrow: { fontSize: 19 },
  sourceFrame: { height: 310, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#2C323D' },
  webview: { flex: 1, backgroundColor: '#0A0B0E' },
  iframe: { borderWidth: 0, width: '100%', height: 310, backgroundColor: '#0A0B0E' },
  tradeButton: { height: 54, borderRadius: 12, backgroundColor: '#00E5FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  tradeText: { color: '#061014', fontSize: 12, fontWeight: '900', letterSpacing: 0.9 },
});
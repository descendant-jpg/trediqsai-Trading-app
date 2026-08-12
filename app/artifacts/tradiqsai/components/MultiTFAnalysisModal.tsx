import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { customFetch } from '@workspace/api-client-react';

type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
type Analysis = {
  symbol: string; price: number; change24h: number; confluence: number; direction: Direction;
  timeframes: Array<{ timeframe: '15M' | '1H' | '4H' | '1D'; label: string; direction: Direction; changePercent: number }>;
  levels: { support: number; resistance: number; liquidity: number }; narrative: string;
};

type Props = { symbol: string | null; onClose: () => void; onTrade: (symbol: string) => void };
const colorFor = (value: Direction) => value === 'BULLISH' ? '#21D99B' : value === 'BEARISH' ? '#FF6174' : '#8A929D';
const money = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 5 })}`;

function Skeleton() {
  return <View style={styles.skeleton}><ActivityIndicator color="#00F0FF" /><Text style={styles.loadingText}>Building multi-timeframe confluence…</Text>{[1, 2, 3, 4].map((key) => <View key={key} style={styles.skeletonLine} />)}</View>;
}

export function MultiTFAnalysisModal({ symbol, onClose, onTrade }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    const load = async () => {
      try {
        const result = await customFetch<Analysis>('/api/analysis/multi-timeframe', {
          method: 'POST',
          body: JSON.stringify({ symbol }),
        });
        if (active) setAnalysis(result);
      } catch (err) {
        console.warn('Multi-timeframe analysis request failed.', err);
        if (active) setError('Live analysis is temporarily unavailable. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [symbol]);

  if (!symbol) return null;
  const sentimentColor = analysis ? colorFor(analysis.direction) : '#00F0FF';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View><Text style={styles.eyebrow}>MULTI-TIMEFRAME BREAKDOWN</Text><Text style={styles.symbol}>{analysis?.symbol ?? symbol}</Text></View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close multi-timeframe analysis" style={styles.close}><Feather name="x" size={20} color="#F4F7FB" /></Pressable>
          </View>
          {loading ? <Skeleton /> : error ? (
            <View style={styles.error}><Feather name="wifi-off" size={22} color="#FF6174" /><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setAnalysis(null)} style={styles.retry}><Text style={styles.retryText}>CLOSE</Text></Pressable></View>
          ) : analysis ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.priceRow}><Text style={styles.price}>{money(analysis.price)}</Text><Text style={[styles.change, { color: analysis.change24h >= 0 ? '#21D99B' : '#FF6174' }]}>{analysis.change24h >= 0 ? '+' : ''}{analysis.change24h.toFixed(2)}% 24H</Text></View>
              <View style={[styles.confluence, { borderColor: `${sentimentColor}77` }]}><View style={[styles.gauge, { borderColor: sentimentColor }]}><Text style={[styles.gaugeValue, { color: sentimentColor }]}>{analysis.confluence}%</Text></View><View><Text style={[styles.confluenceTitle, { color: sentimentColor }]}>{analysis.direction} CONFLUENCE</Text><Text style={styles.confluenceSub}>Calculated from live provider candle structure</Text></View></View>
              <Text style={styles.sectionLabel}>TIMEFRAME STRUCTURE</Text>
              {analysis.timeframes?.map((frame) => <View key={frame.timeframe} style={styles.frame}><View><Text style={styles.frameTime}>{frame.timeframe}</Text><Text style={styles.frameLabel}>{frame.label}</Text></View><View style={styles.frameRight}><Text style={[styles.frameDirection, { color: colorFor(frame.direction) }]}>{frame.direction}</Text><Text style={styles.frameChange}>{frame.changePercent >= 0 ? '+' : ''}{frame.changePercent.toFixed(2)}%</Text></View></View>)}
              <View style={styles.levels}><Text style={styles.sectionLabel}>KEY PRICE LEVELS</Text>{[['Support Zone', analysis.levels.support, '#21D99B'], ['Resistance Zone', analysis.levels.resistance, '#FF6174'], ['Key Liquidity Pool', analysis.levels.liquidity, '#00F0FF']].map(([label, value, color]) => <View key={String(label)} style={styles.levelRow}><Text style={styles.levelLabel}>{label}</Text><Text style={[styles.levelValue, { color: String(color) }]}>{money(Number(value))}</Text></View>)}</View>
              <View style={styles.narrative}><View style={styles.narrativeHead}><Feather name="cpu" size={15} color="#00F0FF" /><Text style={styles.narrativeLabel}>ORACLE TECHNICAL NARRATIVE</Text></View><Text style={styles.narrativeText}>{analysis.narrative}</Text></View>
            </ScrollView>
          ) : null}
          <Pressable disabled={!analysis} onPress={() => analysis && onTrade(analysis.symbol)} style={[styles.trade, !analysis && styles.tradeDisabled]} accessibilityRole="button" accessibilityLabel={`Trade ${symbol} now`}><Text style={styles.tradeText}>TRADE {analysis?.symbol ?? symbol} NOW</Text><Feather name="arrow-up-right" size={18} color="#061014" /></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.68)' }, sheet: { maxHeight: '94%', minHeight: 520, backgroundColor: '#0A0B0E', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2C323D', paddingHorizontal: 20, paddingBottom: 18 }, handle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#3C4350', alignSelf: 'center', marginVertical: 10 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: '#00F0FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, symbol: { color: '#F4F7FB', fontSize: 25, fontWeight: '900', marginTop: 3 }, close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171A20' }, content: { paddingTop: 16, gap: 14, paddingBottom: 16 }, priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 }, price: { color: '#F4F7FB', fontSize: 22, fontWeight: '800' }, change: { fontSize: 12, fontWeight: '900' }, confluence: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, backgroundColor: '#10151A', padding: 14 }, gauge: { width: 66, height: 66, borderRadius: 33, borderWidth: 6, alignItems: 'center', justifyContent: 'center' }, gaugeValue: { fontSize: 17, fontWeight: '900' }, confluenceTitle: { fontSize: 13, fontWeight: '900', letterSpacing: .8 }, confluenceSub: { color: '#8A929D', fontSize: 10, marginTop: 4 }, sectionLabel: { color: '#8A929D', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, frame: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: '#12141A', borderWidth: 1, borderColor: '#252A33' }, frameTime: { color: '#F4F7FB', fontSize: 15, fontWeight: '900' }, frameLabel: { color: '#8A929D', fontSize: 10, marginTop: 2 }, frameRight: { alignItems: 'flex-end' }, frameDirection: { fontSize: 11, fontWeight: '900' }, frameChange: { color: '#8A929D', fontSize: 10, marginTop: 3 }, levels: { gap: 7, padding: 14, borderRadius: 14, backgroundColor: '#12141A', borderWidth: 1, borderColor: '#252A33' }, levelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }, levelLabel: { color: '#BFC7D2', fontSize: 12 }, levelValue: { fontSize: 12, fontWeight: '900' }, narrative: { gap: 9, padding: 14, borderRadius: 14, backgroundColor: 'rgba(0,240,255,.07)', borderWidth: 1, borderColor: 'rgba(0,240,255,.3)' }, narrativeHead: { flexDirection: 'row', alignItems: 'center', gap: 7 }, narrativeLabel: { color: '#00F0FF', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, narrativeText: { color: '#D9E0E9', fontSize: 13, lineHeight: 20 }, trade: { height: 54, borderRadius: 12, backgroundColor: '#00F0FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, tradeDisabled: { opacity: .5 }, tradeText: { color: '#061014', fontSize: 12, fontWeight: '900', letterSpacing: .7 }, skeleton: { paddingVertical: 40, gap: 13, alignItems: 'center' }, loadingText: { color: '#8A929D', fontSize: 12, marginBottom: 8 }, skeletonLine: { width: '100%', height: 50, borderRadius: 10, backgroundColor: '#171A20' }, error: { paddingVertical: 50, gap: 12, alignItems: 'center' }, errorText: { color: '#BFC7D2', textAlign: 'center', fontSize: 13 }, retry: { padding: 10 }, retryText: { color: '#00F0FF', fontWeight: '900', fontSize: 11 },
});
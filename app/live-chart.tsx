import React, { useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import ViewShot from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const chartHtml = (symbol: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#chart{margin:0;width:100%;height:100%;background:#0A0B0E;overflow:hidden}</style></head><body><div id="chart"></div><script src="https://s3.tradingview.com/tv.js"></script><script>new TradingView.widget({container_id:"chart",autosize:true,symbol:"${symbol}",interval:"15",timezone:"Etc/UTC",theme:"dark",style:"1",locale:"en",enable_publishing:false,hide_top_toolbar:false,hide_legend:false,save_image:false,withdateranges:true,studies:["Volume@tv-basicstudies"]});</script></body></html>`;
const QUICK_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'BINANCE:BTCUSD', 'FX:EURUSD'];
const NAV_ITEMS = [
  { label: 'Home', icon: '⌂', route: '/(tabs)' },
  { label: 'TradiQsAI', icon: '↗', route: '/(tabs)/tradiqsai' },
  { label: 'AI Tools', icon: '✦', route: '/(tabs)/ai-tools' },
  { label: 'Signals', icon: 'ϟ', route: '/(tabs)/signals' },
  { label: 'Profile', icon: '◉', route: '/(tabs)/profile' },
] as const;

export default function LiveChartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shotRef = useRef<any>(null);
  const [search, setSearch] = useState('AAPL');
  const [symbol, setSymbol] = useState('AAPL');
  const tradingViewEmbedUrl = useMemo(
    () => `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(symbol)}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC`,
    [symbol],
  );

  const submitSearch = () => {
    const normalized = search.trim().toUpperCase();
    if (normalized) setSymbol(normalized.includes(':') ? normalized : `NASDAQ:${normalized}`);
  };
  const selectQuickSymbol = (quickSymbol: string) => {
    setSearch(quickSymbol);
    setSymbol(quickSymbol);
  };
  const takeSnapshot = async () => {
    if (!shotRef.current?.capture) return;
    try {
      const uri = await shotRef.current.capture();
      if (uri) {
        router.push({ pathname: '/ai-analysis', params: { imageUri: uri } });
      }
    } catch {
      if (Platform.OS === 'web') window.alert('Unable to capture chart.'); else Alert.alert('Snapshot unavailable', 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Live Chart', headerShown: false }} />
      <View style={[styles.mainContent, { paddingBottom: 76 + insets.bottom }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></TouchableOpacity>
          <TextInput value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search" placeholder="Search stocks..." placeholderTextColor="#737983" style={styles.search} />
          <TouchableOpacity onPress={submitSearch} style={styles.searchButton}><Text style={styles.searchButtonText}>GO</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickSymbols}>
          {QUICK_SYMBOLS.map((quickSymbol) => (
            <TouchableOpacity key={quickSymbol} onPress={() => selectQuickSymbol(quickSymbol)} style={[styles.quickChip, symbol === quickSymbol && styles.quickChipActive]}>
              <Text style={[styles.quickChipText, symbol === quickSymbol && styles.quickChipTextActive]}>{quickSymbol}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sentimentBadge}>
          <View style={styles.sentimentDot} />
          <Text style={styles.sentimentText}>AI Bias: 84% Bullish</Text>
        </View>
        <ViewShot ref={shotRef} style={styles.chart} options={{ format: 'jpg', quality: 0.9 }}>
          {Platform.OS === 'web'
            ? React.createElement('iframe', {
                key: tradingViewEmbedUrl,
                src: tradingViewEmbedUrl,
                title: 'TradingView live chart',
                style: { flex: 1, width: '100%', height: '100%', borderWidth: 0, backgroundColor: '#0A0B0E' },
              })
            : <WebView source={{ html: chartHtml(symbol) }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled style={styles.webview} />}
        </ViewShot>
        <TouchableOpacity style={styles.snapshot} onPress={takeSnapshot} activeOpacity={0.85}><Text style={styles.snapshotText}>TAKE SNAPSHOT</Text></TouchableOpacity>
      </View>
      <View style={[styles.bottomNav, { height: 76 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity key={item.label} style={styles.navItem} onPress={() => router.replace(item.route as never)} accessibilityRole="button" accessibilityLabel={item.label}>
            <Text style={styles.navIcon}>{item.icon}</Text>
            <Text style={styles.navLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  mainContent: { flex: 1, minHeight: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 54, paddingBottom: 8, backgroundColor: '#0A0B0E' },
  back: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#00F0FF', fontSize: 34, lineHeight: 34 },
  search: { flex: 1, height: 40, color: '#FFF', backgroundColor: '#12141A', borderWidth: 1, borderColor: '#303641', borderRadius: 9, paddingHorizontal: 12, fontSize: 13 },
  searchButton: { height: 40, paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#00F0FF', alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#061014', fontSize: 11, fontWeight: '900' },
  quickSymbols: { gap: 7, paddingHorizontal: 14, paddingBottom: 8 },
  quickChip: { borderWidth: 1, borderColor: '#303641', backgroundColor: '#12141A', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6 },
  quickChipActive: { borderColor: '#00F0FF', backgroundColor: 'rgba(0,240,255,.12)' },
  quickChipText: { color: '#8A929D', fontSize: 10, fontWeight: '800' },
  quickChipTextActive: { color: '#00F0FF' },
  sentimentBadge: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(0,255,0,.45)', backgroundColor: 'rgba(0,255,0,.08)', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6, marginHorizontal: 14, marginBottom: 7 },
  sentimentDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00FF00' },
  sentimentText: { color: '#00FF00', fontSize: 10, fontWeight: '900' },
  chart: { flex: 1, minHeight: 0, overflow: 'hidden', marginHorizontal: 8 },
  webview: { flex: 1, backgroundColor: '#0A0B0E' },
  snapshot: { margin: 14, height: 58, borderRadius: 13, backgroundColor: '#00FF00', alignItems: 'center', justifyContent: 'center' },
  snapshotText: { color: '#001000', fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 7, backgroundColor: '#0A0B0E', borderTopWidth: 1, borderTopColor: '#29323A' },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { color: '#00F0FF', fontSize: 21, lineHeight: 24 },
  navLabel: { color: '#8A929D', fontSize: 9, fontWeight: '700' },
});
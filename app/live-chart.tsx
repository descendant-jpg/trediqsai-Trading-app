import React, { useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import ViewShot from 'react-native-view-shot';

const chartHtml = (symbol: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#chart{margin:0;width:100%;height:100%;background:#0A0B0E;overflow:hidden}</style></head><body><div id="chart"></div><script src="https://s3.tradingview.com/tv.js"></script><script>new TradingView.widget({container_id:"chart",autosize:true,symbol:"${symbol}",interval:"15",timezone:"Etc/UTC",theme:"dark",style:"1",locale:"en",enable_publishing:false,hide_top_toolbar:false,hide_legend:false,save_image:false,withdateranges:true,studies:["Volume@tv-basicstudies"]});</script></body></html>`;

export default function LiveChartScreen() {
  const router = useRouter();
  const shotRef = useRef<any>(null);
  const [search, setSearch] = useState('BINANCE:BTCUSD');
  const [symbol, setSymbol] = useState('BINANCE:BTCUSD');
  const [scanning, setScanning] = useState(false);

  const submitSearch = () => {
    const normalized = search.trim().toUpperCase();
    if (normalized) setSymbol(normalized.includes(':') ? normalized : `NASDAQ:${normalized}`);
  };
  const takeSnapshot = async () => {
    if (!shotRef.current?.capture) return;
    try {
      const uri = await shotRef.current.capture();
      if (uri) {
        router.push({ pathname: '/ai-analysis', params: { imageUri: uri } });
      }
    } catch {
      setScanning(false);
      if (Platform.OS === 'web') window.alert('Unable to capture chart.'); else Alert.alert('Snapshot unavailable', 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Live Chart', headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <TextInput value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search" placeholder="Search stocks..." placeholderTextColor="#737983" style={styles.search} />
        <TouchableOpacity onPress={submitSearch} style={styles.searchButton}><Text style={styles.searchButtonText}>GO</Text></TouchableOpacity>
      </View>
      <ViewShot ref={shotRef} style={styles.chart} options={{ format: 'jpg', quality: 0.9 }}>
        <WebView source={{ html: chartHtml(symbol) }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled style={styles.webview} />
      </ViewShot>
      {scanning && <View style={styles.overlay}><Text style={styles.overlayText}>AI Scanning Chart...</Text></View>}
      <TouchableOpacity style={styles.snapshot} onPress={takeSnapshot} activeOpacity={0.85}><Text style={styles.snapshotText}>TAKE SNAPSHOT</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 54, paddingBottom: 10, backgroundColor: '#0A0B0E' },
  back: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#00F0FF', fontSize: 34, lineHeight: 34 },
  search: { flex: 1, height: 40, color: '#FFF', backgroundColor: '#12141A', borderWidth: 1, borderColor: '#303641', borderRadius: 9, paddingHorizontal: 12, fontSize: 13 },
  searchButton: { height: 40, paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#00F0FF', alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#061014', fontSize: 11, fontWeight: '900' },
  chart: { flex: 1, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#0A0B0E' },
  snapshot: { margin: 14, height: 58, borderRadius: 13, backgroundColor: '#00FF00', alignItems: 'center', justifyContent: 'center' },
  snapshotText: { color: '#001000', fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  overlay: { position: 'absolute', left: 20, right: 20, bottom: 90, backgroundColor: '#071407EE', borderWidth: 1, borderColor: '#00FF00', borderRadius: 10, padding: 15, alignItems: 'center' },
  overlayText: { color: '#00FF00', fontSize: 14, fontWeight: '800' },
});
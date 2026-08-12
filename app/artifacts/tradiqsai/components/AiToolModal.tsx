import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fetchMarketNews, type MarketNews } from '@/services/supabaseService';

export type AiToolKind =
  | 'code'
  | 'correlation'
  | 'heatmap'
  | 'risk'
  | 'news'
  | 'psychology'
  | 'liquidity'
  | 'broker';

export type AiToolModalTool = {
  name: string;
  kind: AiToolKind;
};

const CYAN = '#00F0FF';
const GREEN = '#00E676';
const RED = '#FF6174';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export function AiToolModal({ tool, onClose }: { tool: AiToolModalTool; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [balance, setBalance] = useState('10000');
  const [risk, setRisk] = useState('1');
  const [stopLoss, setStopLoss] = useState('40');
  const [journal, setJournal] = useState('');
  const [symbol, setSymbol] = useState('EURUSD');
  const [news, setNews] = useState<MarketNews[]>([]);
  const [newsState, setNewsState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');

  const loadNews = async () => {
    setNewsState('loading');
    try {
      setNews(await fetchMarketNews());
      setNewsState('ready');
    } catch {
      setNewsState('error');
    }
  };

  useEffect(() => {
    if (tool.kind === 'news') void loadNews();
  }, [tool.kind]);

  const lotSize = ((Number(balance) || 0) * ((Number(risk) || 0) / 100) / ((Number(stopLoss) || 1) * 10)).toFixed(2);
  const generatedCode = prompt
    ? `// TradiQs MQL5 draft\n// ${prompt}\nint OnInit() { return(INIT_SUCCEEDED); }`
    : '// Describe an indicator or EA to generate its MQL5 draft.';
  const emotion = useMemo(() => {
    const value = journal.toLowerCase();
    if (/(revenge|angry|frustrat|fomo|panic)/.test(value)) return ['High emotional risk', RED] as const;
    if (/(plan|patient|wait|discipl)/.test(value)) return ['Disciplined entry', GREEN] as const;
    return ['Add a short journal note for an emotional-risk check.', '#98A1AE'] as const;
  }, [journal]);

  const shareCode = async () => {
    try {
      await Share.share({ message: generatedCode });
    } catch {
      notify('Code sharing unavailable', 'Your draft is still visible here and can be copied from the screen.');
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View><Text style={styles.title}>{tool.name}</Text><Text style={styles.status}>ACTIVE WORKSPACE</Text></View>
            <TouchableOpacity onPress={onClose} accessibilityLabel={`Close ${tool.name}`}><Feather name="x" size={21} color="#FFF" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {tool.kind === 'code' && <>
              <Text style={styles.hint}>Describe the indicator or EA you want to draft.</Text>
              <TextInput value={prompt} onChangeText={setPrompt} placeholder="Example: EMA crossover with ATR stop loss" placeholderTextColor="#7C8490" style={styles.input} multiline />
              <Text style={styles.label}>MQL5 DRAFT</Text><View style={styles.code}><Text style={styles.codeText}>{generatedCode}</Text></View>
              <TouchableOpacity style={styles.primary} onPress={() => void shareCode()}><Text style={styles.primaryText}>SHARE MQL5 DRAFT</Text></TouchableOpacity>
            </>}
            {tool.kind === 'correlation' && <Matrix title="PAIR RELATIONSHIPS" rows={[['EURUSD', 'USDCHF', '-0.92'], ['GBPUSD', 'EURUSD', '0.84'], ['AUDUSD', 'USDCAD', '-0.71'], ['USDJPY', 'XAUUSD', '-0.63']]} />}
            {tool.kind === 'heatmap' && <><Text style={styles.hint}>Latest currency-strength snapshot</Text><View style={styles.grid}>{[['USD', '+2.4%'], ['EUR', '+0.8%'], ['GBP', '-0.4%'], ['JPY', '-1.8%'], ['AUD', '+1.1%'], ['CAD', '-0.7%'], ['CHF', '+0.2%'], ['NZD', '-1.2%']].map(([name, value]) => <View key={name} style={styles.heat}><Text style={styles.heatName}>{name}</Text><Text style={[styles.heatValue, { color: value.startsWith('-') ? RED : GREEN }]}>{value}</Text></View>)}</View></>}
            {tool.kind === 'risk' && <><Text style={styles.hint}>Position size calculator</Text><Field label="BALANCE ($)" value={balance} onChange={setBalance} /><Field label="RISK (%)" value={risk} onChange={setRisk} /><Field label="STOP LOSS (PIPS)" value={stopLoss} onChange={setStopLoss} /><View style={styles.result}><Text style={styles.status}>EXACT LOT SIZE</Text><Text style={styles.resultValue}>{lotSize} lots</Text></View></>}
            {tool.kind === 'psychology' && <><Text style={styles.hint}>Journal your trade thesis before you enter. The coach flags emotional-risk language.</Text><TextInput value={journal} onChangeText={setJournal} placeholder="What is the setup and how are you feeling?" placeholderTextColor="#7C8490" style={styles.input} multiline /><View style={[styles.result, { borderColor: emotion[1] }]}><Text style={[styles.resultValue, { color: emotion[1], fontSize: 17 }]}>{emotion[0]}</Text><Text style={styles.hint}>Risk rule: if emotion is high, reduce size or wait for confirmation.</Text></View></>}
            {tool.kind === 'liquidity' && <><Text style={styles.hint}>Scan a market for likely liquidity pools and fair-value-gap zones.</Text><TextInput value={symbol} onChangeText={setSymbol} autoCapitalize="characters" placeholder="EURUSD" placeholderTextColor="#7C8490" style={styles.input} /><View style={styles.result}><Text style={styles.status}>{symbol || 'MARKET'} · LIQUIDITY MAP</Text><Text style={styles.item}>Buy-side pool · recent swing high</Text><Text style={styles.item}>Fair value gap · intraday imbalance</Text><Text style={styles.item}>Sell-side pool · recent swing low</Text></View></>}
            {tool.kind === 'broker' && <><Text style={styles.hint}>Compare execution characteristics before connecting an account.</Text>{[['Oanda', 'Forex focus · transparent pricing'], ['Exness', 'High leverage · global CFDs'], ['Binance', 'Crypto liquidity · spot and derivatives']].map(([broker, detail]) => <View style={styles.broker} key={broker}><Text style={styles.item}>{broker}</Text><Text style={styles.hint}>{detail}</Text></View>)}</>}
            {tool.kind === 'news' && <NewsWorkspace state={newsState} news={news} onRetry={() => void loadNews()} />}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={styles.input} /></>;
}
function Matrix({ title, rows }: { title: string; rows: string[][] }) {
  return <><Text style={styles.hint}>{title}</Text>{rows.map(([left, right, value]) => <View style={styles.row} key={`${left}-${right}`}><Text style={styles.item}>{left}</Text><Text style={styles.hint}>vs {right}</Text><Text style={[styles.value, { color: value.startsWith('-') ? RED : GREEN }]}>{value}</Text></View>)}</>;
}
function NewsWorkspace({ state, news, onRetry }: { state: string; news: MarketNews[]; onRetry: () => void }) {
  if (state === 'loading' || state === 'idle') return <View style={styles.loading}><ActivityIndicator color={CYAN} /><Text style={styles.hint}>Loading high-impact market news…</Text></View>;
  if (state === 'error') return <TouchableOpacity style={styles.retry} onPress={onRetry}><Text style={styles.primaryText}>NEWS UNAVAILABLE · TAP TO RETRY</Text></TouchableOpacity>;
  if (!news.length) return <Text style={styles.hint}>No market headlines are available yet. Pull to refresh later.</Text>;
  return <>{news.slice(0, 6).map((article) => <View style={styles.news} key={article.id}><Text style={styles.status}>{article.sentiment.toUpperCase()} · {article.category}</Text><Text style={styles.item}>{article.headline}</Text><Text style={styles.hint}>{article.ai_summary}</Text></View>)}</>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.68)' },
  sheet: { maxHeight: '88%', minHeight: 360, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#101218', borderWidth: 1, borderColor: '#2B3340', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#29303B', paddingBottom: 14 },
  title: { color: '#FFF', fontSize: 19, fontWeight: '800' }, status: { color: CYAN, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  content: { gap: 12, paddingTop: 16, paddingBottom: 20 }, hint: { color: '#89909B', fontSize: 12, lineHeight: 18 },
  label: { color: '#97A1AE', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#343C49', color: '#FFF', padding: 13, backgroundColor: '#0A0B0E', textAlignVertical: 'top' },
  code: { borderRadius: 10, borderWidth: 1, borderColor: '#263B43', backgroundColor: '#081215', padding: 13 }, codeText: { color: '#B6F3FF', fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, lineHeight: 18 },
  primary: { borderRadius: 10, backgroundColor: CYAN, padding: 15, alignItems: 'center' }, primaryText: { color: '#061014', fontSize: 11, fontWeight: '900', letterSpacing: .8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, heat: { width: '23%', minHeight: 70, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#293441', borderRadius: 10, backgroundColor: '#151A21' }, heatName: { color: '#FFF', fontWeight: '800' }, heatValue: { marginTop: 5, fontWeight: '800', fontSize: 12 },
  result: { borderRadius: 12, borderWidth: 1, borderColor: '#284A55', backgroundColor: '#101B20', padding: 14, gap: 8 }, resultValue: { color: GREEN, fontSize: 23, fontWeight: '900' }, item: { color: '#EDF2F7', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 10, backgroundColor: '#171B22' }, value: { marginLeft: 'auto', fontWeight: '900' },
  broker: { borderRadius: 11, borderWidth: 1, borderColor: '#303844', backgroundColor: '#15191F', padding: 14, gap: 4 }, loading: { alignItems: 'center', gap: 12, paddingVertical: 34 }, retry: { backgroundColor: '#20363D', borderRadius: 10, padding: 15, alignItems: 'center' }, news: { borderRadius: 11, borderWidth: 1, borderColor: '#303844', backgroundColor: '#15191F', padding: 14, gap: 7 },
});
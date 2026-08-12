import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { customFetch } from '@workspace/api-client-react';

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
type LiveNews = { headline: string; summary: string; url: string; image: string; datetime: number };
function normalizeNews(value: unknown): LiveNews[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((article): article is Record<string, unknown> => !!article && typeof article === 'object')
    .map((article) => ({
      headline: typeof article.headline === 'string' && article.headline.trim() ? article.headline.trim() : 'No title available',
      summary: typeof article.summary === 'string' ? article.summary.trim() : '',
      url: typeof article.url === 'string' ? article.url : '',
      image: typeof article.image === 'string' ? article.image : '',
      datetime: typeof article.datetime === 'number' && Number.isFinite(article.datetime) ? article.datetime : 0,
    }));
}

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
  const [news, setNews] = useState<LiveNews[]>([]);
  const [newsState, setNewsState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [selectedArticle, setSelectedArticle] = useState<LiveNews | null>(null);
  const [sentiment, setSentiment] = useState('');
  const [sentimentState, setSentimentState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');

  const loadNews = async () => {
    setNewsState('loading');
    try {
      const payload = await customFetch<unknown>('/api/market-news');
      setNews(normalizeNews(payload));
      setNewsState('ready');
    } catch {
      setNews([]);
      setNewsState('error');
    }
  };

  useEffect(() => {
    if (tool.kind === 'news') void loadNews();
  }, [tool.kind]);

  const analyzeArticle = async (article: LiveNews) => {
    setSelectedArticle(article);
    setSentimentState('loading');
    try {
      const result = await customFetch<{ analysis: string }>('/api/market-news/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: article.headline, summary: article.summary }),
      });
      setSentiment(result.analysis);
      setSentimentState('ready');
    } catch {
      setSentimentState('error');
    }
  };

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
            {tool.kind === 'news' && (selectedArticle
              ? <NewsAnalysis article={selectedArticle} state={sentimentState} analysis={sentiment} onBack={() => setSelectedArticle(null)} />
              : <NewsWorkspace state={newsState} news={news} onRetry={() => void loadNews()} onArticle={(article) => void analyzeArticle(article)} />)}
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
function NewsWorkspace({ state, news, onRetry, onArticle }: { state: string; news: LiveNews[]; onRetry: () => void; onArticle: (article: LiveNews) => void }) {
  if (state === 'loading' || state === 'idle') return <View style={styles.loading}><ActivityIndicator color={CYAN} /><View style={styles.skeleton} /><View style={styles.skeleton} /><Text style={styles.hint}>Loading live market headlines…</Text></View>;
  if (state === 'error') return <TouchableOpacity style={styles.retry} onPress={onRetry}><Text style={styles.primaryText}>REFRESH LIVE NEWS</Text></TouchableOpacity>;
  if (!Array.isArray(news) || !news.length) return <Text style={styles.hint}>No market headlines are available yet. Pull to refresh later.</Text>;
  return <>{news.map((article, index) => {
    const headline = article?.headline || 'No title available';
    const summary = article?.summary || 'Open this headline for current market context.';
    const image = typeof article?.image === 'string' ? article.image : '';
    const timestamp = typeof article?.datetime === 'number' && article.datetime > 0
      ? new Date(article.datetime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'LIVE';
    return <TouchableOpacity style={styles.news} key={`${article?.url || headline}-${article?.datetime || index}`} onPress={() => onArticle(article)}><View style={styles.newsTop}>{image ? <Image source={{ uri: image }} style={styles.newsImage} /> : <Feather name="radio" size={20} color={CYAN} />}<Text style={styles.status}>{timestamp}</Text></View><Text style={styles.item}>{headline}</Text><Text style={styles.hint} numberOfLines={3}>{summary}</Text><Text style={styles.openAnalysis}>ANALYZE SENTIMENT ›</Text></TouchableOpacity>;
  })}</>;
}
function NewsAnalysis({ article, state, analysis, onBack }: { article: LiveNews; state: string; analysis: string; onBack: () => void }) {
  return <><TouchableOpacity onPress={onBack}><Text style={styles.openAnalysis}>‹ BACK TO MARKET RADAR</Text></TouchableOpacity><View style={styles.news}><Text style={styles.item}>{article.headline}</Text><Text style={styles.hint}>{article.summary}</Text></View>{state === 'loading' ? <View style={styles.loading}><ActivityIndicator color={CYAN} /><Text style={styles.hint}>AI is evaluating market impact…</Text></View> : state === 'error' ? <Text style={styles.hint}>Sentiment analysis is temporarily unavailable. Try another headline shortly.</Text> : <View style={styles.sentiment}><Text style={styles.status}>AI MARKET IMPACT</Text><Text style={styles.analysis}>{analysis}</Text></View>}</>;
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
  broker: { borderRadius: 11, borderWidth: 1, borderColor: '#303844', backgroundColor: '#15191F', padding: 14, gap: 4 }, loading: { alignItems: 'center', gap: 12, paddingVertical: 34 }, retry: { backgroundColor: '#20363D', borderRadius: 10, padding: 15, alignItems: 'center' }, news: { borderRadius: 11, borderWidth: 1, borderColor: '#303844', backgroundColor: '#15191F', padding: 14, gap: 7 }, newsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, newsImage: { width: 42, height: 30, borderRadius: 5, backgroundColor: '#202834' }, openAnalysis: { color: CYAN, fontSize: 10, fontWeight: '900', letterSpacing: .7, marginTop: 3 }, sentiment: { borderRadius: 12, borderWidth: 1, borderColor: '#275160', backgroundColor: '#0B171B', padding: 16, gap: 10 }, analysis: { color: '#EAF8FA', fontSize: 14, lineHeight: 22 }, skeleton: { width: '100%', height: 76, borderRadius: 10, backgroundColor: '#1B222B' },
});
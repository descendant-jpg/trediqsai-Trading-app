import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';

const CYAN = '#00F0FF';

function SettingRow({ title, subtitle, value, onValueChange }: { title: string; subtitle: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#30343D', true: '#1A6570' }} thumbColor={value ? CYAN : '#8A8D93'} /></View>;
}

export default function ChartSettingsScreen() {
  const [candles, setCandles] = useState(true);
  const [institutional, setInstitutional] = useState(true);
  const [volume, setVolume] = useState(true);
  const [rsi, setRsi] = useState(false);
  const [watermark, setWatermark] = useState(true);
  return <View style={styles.container}><Stack.Screen options={{ title: 'Chart Settings', headerShown: true, headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFFFFF' }} /><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>VISUAL TERMINAL</Text><Text style={styles.title}>Chart Settings</Text><Text style={styles.intro}>Tune your market view for faster, clearer decisions.</Text><Text style={styles.section}>CHART TYPE</Text><View style={styles.card}><SettingRow title="Candles" subtitle="Classic OHLC price action" value={candles} onValueChange={setCandles} /><SettingRow title="Heikin Ashi" subtitle="Smoothed trend visualization" value={!candles} onValueChange={(value) => setCandles(!value)} /></View><Text style={styles.section}>COLOR THEME</Text><View style={styles.card}><SettingRow title="Institutional Cyan / Red" subtitle="TradiQs terminal palette" value={institutional} onValueChange={setInstitutional} /><SettingRow title="Classic Green / Red" subtitle="Traditional market colors" value={!institutional} onValueChange={(value) => setInstitutional(!value)} /></View><Text style={styles.section}>DEFAULT INDICATORS</Text><View style={styles.card}><SettingRow title="Show Volume" subtitle="Display institutional activity" value={volume} onValueChange={setVolume} /><SettingRow title="Show RSI" subtitle="Display momentum oscillator" value={rsi} onValueChange={setRsi} /></View><Text style={styles.section}>SHARING</Text><View style={styles.card}><SettingRow title="Social Sharing Watermark" subtitle="Identify your analysis as TradiQs AI" value={watermark} onValueChange={setWatermark} /></View></ScrollView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 40 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '700', letterSpacing: 2 }, title: { color: '#FFF', fontSize: 28, fontWeight: '700', marginTop: 8 }, intro: { color: '#8A8D93', fontSize: 13, marginTop: 7 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 28, marginBottom: 9 }, card: { backgroundColor: '#16181D', borderRadius: 14, borderWidth: 1, borderColor: '#262930', paddingHorizontal: 15 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 70, borderBottomWidth: 1, borderBottomColor: '#262930' }, copy: { flex: 1, paddingRight: 15 }, rowTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' }, subtitle: { color: '#737983', fontSize: 11, marginTop: 4 } });
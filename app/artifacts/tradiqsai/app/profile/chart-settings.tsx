import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';

const CYAN = '#00F0FF';
const SETTINGS_KEY = 'tradiqs.chart-settings.v1';
type Settings = { useHeikinAshi: boolean; useInstitutionalColors: boolean; showDefaultVolume: boolean; showWatermark: boolean };
const defaults: Settings = { useHeikinAshi: false, useInstitutionalColors: true, showDefaultVolume: true, showWatermark: true };

function SettingRow({ title, subtitle, value, onValueChange }: { title: string; subtitle: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#30343D', true: '#1A6570' }} thumbColor={value ? CYAN : '#8A8D93'} /></View>;
}

export default function ChartSettingsScreen() {
  const [settings, setSettings] = useState<Settings>(defaults);
  useEffect(() => { AsyncStorage.getItem(SETTINGS_KEY).then((raw) => { if (!raw) return; try { setSettings({ ...defaults, ...(JSON.parse(raw) as Partial<Settings>) }); } catch { /* use defaults */ } }).catch(() => {}); }, []);
  const update = (key: keyof Settings, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
  };
  return <View style={styles.container}><Stack.Screen options={{ title: 'Chart Settings', headerShown: true, headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFFFFF' }} /><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>VISUAL TERMINAL</Text><Text style={styles.title}>Chart Settings</Text><Text style={styles.intro}>Tune your market view for faster, clearer decisions.</Text><Text style={styles.section}>CHART TYPE</Text><View style={styles.card}><SettingRow title="Heikin Ashi" subtitle="Smoothed trend visualization" value={settings.useHeikinAshi} onValueChange={(v) => update('useHeikinAshi', v)} /></View><Text style={styles.section}>COLOR THEME</Text><View style={styles.card}><SettingRow title="Institutional Cyan / Red" subtitle="TradiQs terminal palette" value={settings.useInstitutionalColors} onValueChange={(v) => update('useInstitutionalColors', v)} /></View><Text style={styles.section}>DEFAULT INDICATORS</Text><View style={styles.card}><SettingRow title="Show Volume" subtitle="Display institutional activity" value={settings.showDefaultVolume} onValueChange={(v) => update('showDefaultVolume', v)} /></View><Text style={styles.section}>SHARING</Text><View style={styles.card}><SettingRow title="Social Sharing Watermark" subtitle="Identify your analysis as TradiQs AI" value={settings.showWatermark} onValueChange={(v) => update('showWatermark', v)} /></View></ScrollView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 40 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '700', letterSpacing: 2 }, title: { color: '#FFF', fontSize: 28, fontWeight: '700', marginTop: 8 }, intro: { color: '#8A8D93', fontSize: 13, marginTop: 7 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 28, marginBottom: 9 }, card: { backgroundColor: '#16181D', borderRadius: 14, borderWidth: 1, borderColor: '#262930', paddingHorizontal: 15 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 70 }, copy: { flex: 1, paddingRight: 15 }, rowTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' }, subtitle: { color: '#737983', fontSize: 11, marginTop: 4 } });
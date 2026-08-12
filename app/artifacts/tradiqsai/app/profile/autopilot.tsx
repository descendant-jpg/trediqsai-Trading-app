import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';

const CYAN = '#00F0FF';
type SubscriptionTier = 'free' | 'elite' | string;
type Bot = { name: string; winRate: string; drawdown: string; description: string; requiresPro: boolean };
const bots: Bot[] = [
  { name: 'Pulse Scalper', winRate: '72%', drawdown: '4.8%', description: 'High-frequency momentum entries for liquid session windows.', requiresPro: false },
  { name: 'Swing Master', winRate: '68%', drawdown: '7.2%', description: 'Multi-session structure trades with adaptive targets.', requiresPro: true },
  { name: 'News Sniper', winRate: '64%', drawdown: '9.1%', description: 'Volatility-aware event reactions with defined risk.', requiresPro: true },
];
function notify(title: string, message: string) { if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`); else Alert.alert(title, message); }

export default function AutoPilotScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [activeBot, setActiveBot] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<number | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('free');
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingAllocation, setPendingAllocation] = useState(25);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!session?.user.id) return;
    void (async () => {
      try {
        // `tier` is server-owned: clients can read it but cannot write it
        // (enforced by RLS + column privileges), so it is safe to trust for
        // display. The lock below is only a UI affordance -- the server is
        // what actually refuses a Pro bot to a free account.
        const { data } = await supabase.from('profiles').select('active_bot, allocated_capital, tier').eq('id', session.user.id).maybeSingle();
        setActiveBot(data?.active_bot ?? null);
        setAllocation(data?.allocated_capital == null ? null : Number(data.allocated_capital));
        setSubscriptionTier(data?.tier ?? 'free');
      } catch { /* keep defaults until the profile loads */ }
    })();
  }, [session?.user.id]);
  const updateBot = async (bot: string | null, percent: number | null) => {
    if (!session?.user.id) return notify('Sign in required', 'Sign in to manage an AutoPilot bot.');
    setSaving(true);
    // Deploying goes through set_active_bot() rather than a direct column
    // write: the strategy name decides whether a paid plan is required, so
    // the database re-checks the tier itself. The lock in the UI below is
    // only an affordance -- this call is what actually enforces it.
    const { error } = await supabase.rpc('set_active_bot', { bot_name: bot, capital_percent: percent });
    setSaving(false);
    if (error) {
      const denied = error.code === '42501' || /Elite subscription/i.test(error.message ?? '');
      if (denied) {
        notify('Elite required', 'This strategy is part of TradiQs Elite. Upgrade to deploy it.');
        router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } });
        return;
      }
      return notify('AutoPilot unavailable', error.message);
    }
    setActiveBot(bot); setAllocation(percent); setSelected(null);
  };
  const active = bots.find((bot) => bot.name === activeBot);
  return <View style={styles.container}><Stack.Screen options={{ title: 'Algorithmic AutoPilot', headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }} /><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>AUTONOMOUS STRATEGIES</Text><Text style={styles.title}>Algorithmic AutoPilot</Text><Text style={styles.intro}>Deploy a disciplined strategy and control exactly how much capital it can command.</Text>
    {active && <View style={styles.activeCard}><Text style={styles.activeLabel}>● ACTIVE DEPLOYMENT</Text><Text style={styles.activeName}>{active.name}</Text><Text style={styles.activeCopy}>{allocation ?? 0}% capital allocation · monitoring live</Text><TouchableOpacity style={styles.deactivate} onPress={() => updateBot(null, null)} disabled={saving}><Text style={styles.deactivateText}>{saving ? 'Updating…' : 'Deactivate'}</Text></TouchableOpacity></View>}
    <Text style={styles.section}>STRATEGY DESK</Text>{bots.map((bot) => { const locked = bot.requiresPro && subscriptionTier === 'free'; return <View key={bot.name} style={[styles.botCard, activeBot === bot.name && styles.currentBot]}><TouchableOpacity style={styles.botHeader} onPress={() => setSelected(selected === bot.name ? null : bot.name)}><View><View style={styles.nameRow}><Text style={styles.botName}>{bot.name}</Text>{bot.requiresPro && <View style={styles.proBadge}><Feather name={locked ? 'lock' : 'star'} size={10} color="#0A0B0E" /><Text style={styles.proText}>PRO</Text></View>}</View><Text style={styles.botCopy}>{bot.description}</Text></View><Feather name={selected === bot.name ? 'chevron-up' : 'chevron-down'} size={20} color={CYAN} /></TouchableOpacity><View style={styles.metrics}><Text style={styles.metric}>WIN RATE <Text style={styles.good}>{bot.winRate}</Text></Text><Text style={styles.metric}>MAX DD <Text style={styles.bad}>{bot.drawdown}</Text></Text></View>{selected === bot.name && <View style={styles.deploy}>{locked ? <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } })}><Feather name="lock" size={15} color="#0A0B0E" /><Text style={styles.upgradeText}>UNLOCK WITH ELITE</Text></TouchableOpacity> : <><View style={styles.allocationRow}><Text style={styles.allocateTitle}>Capital allocation</Text><Text style={styles.percent}>{pendingAllocation}%</Text></View><View style={styles.stepper}><TouchableOpacity onPress={() => setPendingAllocation((value) => Math.max(10, value - 10))} style={styles.step}><Text style={styles.stepText}>−</Text></TouchableOpacity><View style={styles.range}><View style={[styles.rangeFill, { width: `${pendingAllocation}%` }]} /></View><TouchableOpacity onPress={() => setPendingAllocation((value) => Math.min(100, value + 10))} style={styles.step}><Text style={styles.stepText}>+</Text></TouchableOpacity></View><Text style={styles.hint}>Allocation range: 10%–100%</Text><TouchableOpacity style={styles.deployButton} onPress={() => updateBot(bot.name, pendingAllocation)} disabled={saving}>{saving ? <ActivityIndicator color="#071014" /> : <Text style={styles.deployText}>DEPLOY BOT</Text>}</TouchableOpacity></>}</View>}</View>; })}</ScrollView></View>;
}
 const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 44 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 }, title: { color: '#FFF', fontSize: 27, fontWeight: '800', marginTop: 8 }, intro: { color: '#89909B', fontSize: 13, lineHeight: 19, marginTop: 8 }, activeCard: { backgroundColor: '#111B20', borderWidth: 1.5, borderColor: CYAN, borderRadius: 14, padding: 17, marginTop: 22, shadowColor: CYAN, shadowOpacity: .35, shadowRadius: 12 }, activeLabel: { color: CYAN, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, activeName: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 9 }, activeCopy: { color: '#A2ABB6', marginTop: 5, fontSize: 12 }, deactivate: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#F06476', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 9, marginTop: 16 }, deactivateText: { color: '#F06476', fontWeight: '800', fontSize: 12 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 27, marginBottom: 10 }, botCard: { backgroundColor: '#16181D', borderRadius: 13, borderWidth: 1, borderColor: '#292D35', padding: 15, marginBottom: 10 }, currentBot: { borderColor: '#29737B' }, botHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, botName: { color: '#FFF', fontSize: 16, fontWeight: '800' }, botCopy: { color: '#8B929E', fontSize: 11, lineHeight: 16, marginTop: 5, maxWidth: 280 }, proBadge: { backgroundColor: '#FFD700', borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3 }, proText: { color: '#0A0B0E', fontSize: 9, fontWeight: '900' }, metrics: { flexDirection: 'row', gap: 20, marginTop: 14 }, metric: { color: '#747B86', fontSize: 10, fontWeight: '800' }, good: { color: '#2ECA8B' }, bad: { color: '#F06476' }, deploy: { borderTopWidth: 1, borderTopColor: '#2A2E36', paddingTop: 15, marginTop: 15 }, allocationRow: { flexDirection: 'row', justifyContent: 'space-between' }, allocateTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' }, percent: { color: CYAN, fontSize: 16, fontWeight: '900' }, stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }, step: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#252A33', alignItems: 'center', justifyContent: 'center' }, stepText: { color: CYAN, fontSize: 22 }, range: { flex: 1, height: 7, backgroundColor: '#303641', borderRadius: 4, overflow: 'hidden' }, rangeFill: { height: '100%', backgroundColor: CYAN }, hint: { color: '#747B86', fontSize: 10, marginTop: 8 }, deployButton: { backgroundColor: CYAN, alignItems: 'center', borderRadius: 10, padding: 15, marginTop: 16 }, deployText: { color: '#071014', fontWeight: '900', letterSpacing: 1 }, upgradeButton: { backgroundColor: '#FFD700', borderRadius: 10, padding: 15, marginTop: 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }, upgradeText: { color: '#0A0B0E', fontWeight: '900', letterSpacing: .7 } });
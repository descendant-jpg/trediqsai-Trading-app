import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useSendStrategyBrief } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';

const CYAN = '#00F0FF';
const TERMINAL_GREEN = '#00FF00';
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

type SubscriptionTier = 'free' | 'elite' | string;
type Bot = { name: string; winRate: string; drawdown: string; description: string; requiresPro: boolean };
const bots: Bot[] = [
  { name: 'Pulse Scalper', winRate: '72%', drawdown: '4.8%', description: 'High-frequency momentum entries for liquid session windows.', requiresPro: false },
  { name: 'Swing Master', winRate: '68%', drawdown: '7.2%', description: 'Multi-session structure trades with adaptive targets.', requiresPro: true },
  { name: 'News Sniper', winRate: '64%', drawdown: '9.1%', description: 'Volatility-aware event reactions with defined risk.', requiresPro: true },
];
function notify(title: string, message: string) { if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`); else Alert.alert(title, message); }

/**
 * PostgREST reports a missing RPC as PGRST202. That means migration 011
 * (`set_active_bot`) has not been applied to the Supabase project yet, which
 * is a deployment problem rather than something the trader did wrong.
 */
function isMissingDeployFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || /Could not find the function/i.test(error.message ?? '');
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function AutoPilotScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [activeBot, setActiveBot] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<number | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('free');
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingAllocation, setPendingAllocation] = useState(25);
  const [saving, setSaving] = useState(false);
  // Live deployment terminal state.
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [aiStrategyLog, setAiStrategyLog] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const { mutateAsync: requestStrategyBrief } = useSendStrategyBrief();

  // Cancels an in-flight boot sequence: bumped on terminate and unmount so a
  // pending timer never writes to an unmounted screen or a terminated bot.
  const runToken = useRef(0);
  useEffect(() => () => { runToken.current += 1; }, []);

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
        // A deployment that predates this screen session gets a restored
        // banner rather than a replayed boot sequence.
        if (data?.active_bot) {
          setTerminalLines([
            `> SESSION RESTORED: ${String(data.active_bot).toUpperCase()}`,
            `> MARGIN ALLOCATION: ${data.allocated_capital ?? 0}%`,
            '> STATUS: ACTIVE AND SCANNING.',
          ]);
        }
      } catch { /* keep defaults until the profile loads */ }
    })();
  }, [session?.user.id]);

  /**
   * Asks the API server for a one-line strategy brief. The Anthropic key
   * lives on the server, never in the app bundle. A failure here is
   * cosmetic, so the terminal falls back to a static line.
   */
  const fetchStrategyBrief = useCallback(async (botName: string, percent: number): Promise<string> => {
    try {
      const { brief } = await requestStrategyBrief({ data: { botName, capitalPercent: percent } });
      return brief;
    } catch (err) {
      console.warn('Strategy brief unavailable', err);
      return 'NEURAL ENGINE OFFLINE — RUNNING ON CACHED STRATEGY PARAMETERS.';
    }
  }, [requestStrategyBrief]);

  const runBootSequence = useCallback(async (botName: string, percent: number) => {
    const token = ++runToken.current;
    const alive = () => runToken.current === token;
    setBooting(true);
    setAiStrategyLog(null);
    setTerminalLines([`> SYSTEM BOOT: ${botName.toUpperCase()}`]);
    await delay(450);
    if (!alive()) return;
    setTerminalLines((lines) => [...lines, `> ALLOCATING ${percent}% MARGIN...`]);
    await delay(550);
    if (!alive()) return;
    setTerminalLines((lines) => [...lines, '> CONNECTING ANTHROPIC NEURAL ENGINE...']);
    const brief = await fetchStrategyBrief(botName, percent);
    if (!alive()) return;
    setAiStrategyLog(brief);
    setTerminalLines((lines) => [...lines, `> ${brief}`]);
    await delay(400);
    if (!alive()) return;
    setTerminalLines((lines) => [...lines, '> STATUS: ACTIVE AND SCANNING.']);
    setBooting(false);
  }, [fetchStrategyBrief]);

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
      if (isMissingDeployFunction(error)) {
        // Deliberately not faked as success: pretending the bot deployed
        // would show "Active" for a strategy the database never recorded,
        // and it would vanish on the next load.
        console.warn('set_active_bot RPC missing — apply supabase/migrations/011_set_active_bot.sql', error);
        return notify('AutoPilot not installed', 'The AutoPilot database setup has not been applied to this project yet, so deployments cannot be saved.');
      }
      const denied = error.code === '42501' || /Elite subscription/i.test(error.message ?? '');
      if (denied) {
        notify('Elite required', 'This strategy is part of TradiQs Elite. Upgrade to deploy it.');
        router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } });
        return;
      }
      return notify('AutoPilot unavailable', error.message);
    }
    setActiveBot(bot); setAllocation(percent); setSelected(null);
    if (bot && percent != null) {
      void runBootSequence(bot, percent);
    } else {
      // Terminated: cancel any in-flight boot and clear the terminal.
      runToken.current += 1;
      setBooting(false);
      setAiStrategyLog(null);
      setTerminalLines([]);
    }
  };

  const active = bots.find((bot) => bot.name === activeBot);
  return <View style={styles.container}><Stack.Screen options={{ title: 'Algorithmic AutoPilot', headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }} /><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>AUTONOMOUS STRATEGIES</Text><Text style={styles.title}>Algorithmic AutoPilot</Text><Text style={styles.intro}>Deploy a disciplined strategy and control exactly how much capital it can command.</Text>
    {active && <View style={styles.terminal} testID="autopilot-terminal">
      <View style={styles.terminalHeader}>
        <View style={styles.terminalTitleRow}><Feather name="terminal" size={13} color={TERMINAL_GREEN} /><Text style={styles.terminalTitle}>{active.name.toUpperCase()} · LIVE</Text></View>
        <Text style={styles.terminalAlloc}>{allocation ?? 0}% MARGIN</Text>
      </View>
      <View style={styles.terminalBody}>
        {terminalLines.map((line, index) => <Text key={`${index}-${line}`} style={styles.terminalLine} selectable>{line}</Text>)}
        {booting && <View style={styles.terminalPending}><ActivityIndicator size="small" color={TERMINAL_GREEN} /><Text style={styles.terminalPendingText}>working…</Text></View>}
      </View>
      <TouchableOpacity style={styles.terminate} onPress={() => updateBot(null, null)} disabled={saving} testID="autopilot-terminate">
        <Feather name="power" size={14} color="#FFF" />
        <Text style={styles.terminateText}>{saving ? 'TERMINATING…' : 'TERMINATE BOT'}</Text>
      </TouchableOpacity>
    </View>}
    <Text style={styles.section}>STRATEGY DESK</Text>{bots.map((bot) => { const locked = bot.requiresPro && subscriptionTier === 'free'; return <View key={bot.name} style={[styles.botCard, activeBot === bot.name && styles.currentBot]}><TouchableOpacity style={styles.botHeader} onPress={() => setSelected(selected === bot.name ? null : bot.name)}><View><View style={styles.nameRow}><Text style={styles.botName}>{bot.name}</Text>{bot.requiresPro && <View style={styles.proBadge}><Feather name={locked ? 'lock' : 'star'} size={10} color="#0A0B0E" /><Text style={styles.proText}>PRO</Text></View>}</View><Text style={styles.botCopy}>{bot.description}</Text></View><Feather name={selected === bot.name ? 'chevron-up' : 'chevron-down'} size={20} color={CYAN} /></TouchableOpacity><View style={styles.metrics}><Text style={styles.metric}>WIN RATE <Text style={styles.good}>{bot.winRate}</Text></Text><Text style={styles.metric}>MAX DD <Text style={styles.bad}>{bot.drawdown}</Text></Text></View>{selected === bot.name && <View style={styles.deploy}>{locked ? <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } })}><Feather name="lock" size={15} color="#0A0B0E" /><Text style={styles.upgradeText}>UNLOCK WITH ELITE</Text></TouchableOpacity> : <><View style={styles.allocationRow}><Text style={styles.allocateTitle}>Capital allocation</Text><Text style={styles.percent}>{pendingAllocation}%</Text></View><View style={styles.stepper}><TouchableOpacity onPress={() => setPendingAllocation((value) => Math.max(10, value - 10))} style={styles.step}><Text style={styles.stepText}>−</Text></TouchableOpacity><View style={styles.range}><View style={[styles.rangeFill, { width: `${pendingAllocation}%` }]} /></View><TouchableOpacity onPress={() => setPendingAllocation((value) => Math.min(100, value + 10))} style={styles.step}><Text style={styles.stepText}>+</Text></TouchableOpacity></View><Text style={styles.hint}>Allocation range: 10%–100%</Text><TouchableOpacity style={styles.deployButton} onPress={() => updateBot(bot.name, pendingAllocation)} disabled={saving}>{saving ? <ActivityIndicator color="#071014" /> : <Text style={styles.deployText}>DEPLOY BOT</Text>}</TouchableOpacity></>}</View>}</View>; })}</ScrollView></View>;
}
 const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 44 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 }, title: { color: '#FFF', fontSize: 27, fontWeight: '800', marginTop: 8 }, intro: { color: '#89909B', fontSize: 13, lineHeight: 19, marginTop: 8 }, terminal: { backgroundColor: '#0A0B0E', borderWidth: 1.5, borderColor: '#1F7A2E', borderRadius: 14, marginTop: 22, overflow: 'hidden', shadowColor: TERMINAL_GREEN, shadowOpacity: .25, shadowRadius: 14 }, terminalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#173D1E', backgroundColor: '#0C1410' }, terminalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, terminalTitle: { color: TERMINAL_GREEN, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, fontFamily: MONO }, terminalAlloc: { color: '#5FB878', fontSize: 10, fontWeight: '800', letterSpacing: .8, fontFamily: MONO }, terminalBody: { padding: 14, minHeight: 120, gap: 6 }, terminalLine: { color: TERMINAL_GREEN, fontSize: 11.5, lineHeight: 18, fontFamily: MONO }, terminalPending: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }, terminalPendingText: { color: '#4E8F5F', fontSize: 11, fontFamily: MONO }, terminate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#C42B3A', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#7E1B26' }, terminateText: { color: '#FFF', fontWeight: '900', fontSize: 12, letterSpacing: 1 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 27, marginBottom: 10 }, botCard: { backgroundColor: '#16181D', borderRadius: 13, borderWidth: 1, borderColor: '#292D35', padding: 15, marginBottom: 10 }, currentBot: { borderColor: '#29737B' }, botHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, botName: { color: '#FFF', fontSize: 16, fontWeight: '800' }, botCopy: { color: '#8B929E', fontSize: 11, lineHeight: 16, marginTop: 5, maxWidth: 280 }, proBadge: { backgroundColor: '#FFD700', borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3 }, proText: { color: '#0A0B0E', fontSize: 9, fontWeight: '900' }, metrics: { flexDirection: 'row', gap: 20, marginTop: 14 }, metric: { color: '#747B86', fontSize: 10, fontWeight: '800' }, good: { color: '#2ECA8B' }, bad: { color: '#F06476' }, deploy: { borderTopWidth: 1, borderTopColor: '#2A2E36', paddingTop: 15, marginTop: 15 }, allocationRow: { flexDirection: 'row', justifyContent: 'space-between' }, allocateTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' }, percent: { color: CYAN, fontSize: 16, fontWeight: '900' }, stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }, step: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#252A33', alignItems: 'center', justifyContent: 'center' }, stepText: { color: CYAN, fontSize: 22 }, range: { flex: 1, height: 7, backgroundColor: '#303641', borderRadius: 4, overflow: 'hidden' }, rangeFill: { height: '100%', backgroundColor: CYAN }, hint: { color: '#747B86', fontSize: 10, marginTop: 8 }, deployButton: { backgroundColor: CYAN, alignItems: 'center', borderRadius: 10, padding: 15, marginTop: 16 }, deployText: { color: '#071014', fontWeight: '900', letterSpacing: 1 }, upgradeButton: { backgroundColor: '#FFD700', borderRadius: 10, padding: 15, marginTop: 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }, upgradeText: { color: '#0A0B0E', fontWeight: '900', letterSpacing: .7 } });

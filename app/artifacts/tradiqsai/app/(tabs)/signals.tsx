import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { customFetch } from '@workspace/api-client-react';
import { useSubscription } from '@/lib/revenuecat';
import { PaywallModal } from '@/components/PaywallModal';
import { AutoPilotSettingsModal } from '@/components/AutoPilotSettingsModal';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';

type SignalStatus = 'Active' | 'Won' | 'Lost' | 'Pending';
type Signal = { id: string; pair: string; assetClass: string; action: string; status: SignalStatus; riskReward: number | string; entry: number | string; stopLoss: number | string; timestamp: number | string; pips: number | string };
const gold = '#FFD55A', cyan = '#00F0FF', green = '#28D68A', red = '#FF6576';
const statuses: Array<SignalStatus | 'All'> = ['All', 'Active', 'Won', 'Lost', 'Pending'];
export const LOCKED_RATIONALE_TEASER = 'AI rationale locked — upgrade to Premium to reveal the full signal setup.';

export default function SignalsScreen() {
  const { accessTier, isAdmin } = useSubscription();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<SignalStatus | 'All'>('All');
  const [paywall, setPaywall] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [autopilotLocked, setAutopilotLocked] = useState(false);
  const premium = isAdmin || accessTier === 'pro' || accessTier === 'elite';
  const load = useCallback(async () => {
    setIsLoading(true); setFailed(false);
    try { const data = await customFetch<Signal[]>('/api/signals'); setSignals(Array.isArray(data) ? data : []); }
    catch { setSignals([]); setFailed(true); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => signals.filter((signal) => filter === 'All' || signal.status === filter), [filter, signals]);
  const closeLocked = () => setAutopilotLocked(false);
  return (
    <View style={s.page}>
      <View style={s.header}><View><Text style={s.kicker}>LIVE MARKET INTELLIGENCE</Text><Text style={s.title}>Signal Desk</Text></View><TouchableOpacity onPress={() => void load()} accessibilityLabel="Refresh live signals"><Feather name="refresh-cw" size={20} color={cyan} /></TouchableOpacity></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{statuses.map((status) => <Pressable key={status} onPress={() => setFilter(status)} style={[s.filter, filter === status && s.filterActive]}><Text style={[s.filterText, filter === status && s.filterTextActive]}>{status}</Text></Pressable>)}</ScrollView>
      {isLoading ? <View style={s.center}><ActivityIndicator color={cyan} /><Text style={s.muted}>Syncing live signals…</Text></View> : <ScrollView contentContainerStyle={s.list}>
        {failed ? <TouchableOpacity onPress={() => void load()} style={s.empty}><Feather name="wifi-off" size={25} color={gold} /><Text style={s.emptyTitle}>Live signal feed unavailable</Text><Text style={s.muted}>Tap to retry the secure connection.</Text></TouchableOpacity> : !visible.length ? <View style={s.empty}><Feather name="activity" size={28} color={gold} /><Text style={s.emptyTitle}>No Active Signals</Text></View> : visible.map((signal) => <SignalCard key={signal.id} signal={signal} locked={!premium} onUpgrade={() => setPaywall(true)} />)}
        <RiskDisclaimer />
      </ScrollView>}
      <TouchableOpacity style={s.fab} onPress={() => premium ? setAutopilot(true) : setAutopilotLocked(true)} accessibilityLabel="Open AutoPilot"><Feather name="cpu" size={25} color="#050505" /><Text style={s.fabText}>AI</Text></TouchableOpacity>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
      <Modal visible={autopilotLocked} transparent animationType="fade" onRequestClose={closeLocked}>
        <Pressable style={s.overlay} onPress={closeLocked}>
          <Pressable style={s.sheet} onPress={(event) => event.stopPropagation()}>
            <TouchableOpacity style={s.close} onPress={closeLocked} accessibilityLabel="Close upgrade offer"><Feather name="x" size={22} color="#AAB2BF" /></TouchableOpacity>
            <View style={s.aiIcon}><Feather name="lock" size={28} color={gold} /></View><Text style={s.sheetTitle}>AutoPilot is a Premium Feature</Text><Text style={s.sheetBody}>Upgrade to run automated trading bots.</Text>
            <TouchableOpacity style={s.sheetButton} onPress={() => { closeLocked(); setPaywall(true); }}><Text style={s.sheetButtonText}>UPGRADE NOW</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <AutoPilotSettingsModal visible={autopilot} onClose={() => setAutopilot(false)} />
    </View>
  );
}
function SignalCard({ signal, locked, onUpgrade }: { signal: Signal; locked: boolean; onUpgrade: () => void }) {
  const actionColor = /buy|long/i.test(signal.action) ? green : red;
  return <View style={s.card}><View style={s.cardHead}><View><Text style={s.pair}>{signal.pair}</Text><Text style={[s.action, { color: actionColor }]}>{signal.action} · {signal.assetClass.toUpperCase()}</Text></View><Text style={s.status}>{signal.status.toUpperCase()}</Text></View><View style={s.grid}><Text style={s.value}>ENTRY {signal.entry}</Text><Text style={s.value}>SL {signal.stopLoss}</Text><Text style={s.value}>R:R {signal.riskReward}</Text>{locked && <TouchableOpacity style={s.lockOverlay} onPress={onUpgrade}><Text style={s.lockText}>🔒 UNLOCK WITH PREMIUM</Text></TouchableOpacity>}</View><View style={s.cardFooter}><Text style={s.pips}>{Number(signal.pips) >= 0 ? '+' : ''}{signal.pips} PIPS</Text><Text style={s.time}>{new Date(Number(signal.timestamp) < 1e11 ? Number(signal.timestamp) * 1000 : Number(signal.timestamp)).toLocaleString()}</Text></View></View>;
}
const s = StyleSheet.create({ page:{flex:1,backgroundColor:'#0A0B0E',paddingTop:56},header:{paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{color:cyan,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:'#FFF',fontSize:29,fontWeight:'900',marginTop:4},filters:{alignItems:'center',paddingHorizontal:20,paddingVertical:10},filter:{paddingHorizontal:16,paddingVertical:8,borderRadius:20,marginRight:10,backgroundColor:'#191C22'},filterActive:{backgroundColor:cyan},filterText:{color:'#9BA3AE',fontSize:11,fontWeight:'800'},filterTextActive:{color:'#071014'},list:{padding:20,paddingTop:0,gap:12,paddingBottom:110},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},muted:{color:'#8A929E',fontSize:12,textAlign:'center'},empty:{marginTop:60,alignItems:'center',gap:12,padding:25},emptyTitle:{color:'#FFF',fontSize:17,fontWeight:'900'},card:{backgroundColor:'#15181E',borderWidth:1,borderColor:'#292E38',borderRadius:16,padding:16},cardHead:{flexDirection:'row',justifyContent:'space-between'},pair:{color:'#FFF',fontSize:20,fontWeight:'900'},action:{fontSize:11,fontWeight:'900',marginTop:4},status:{color:'#BBC3CE',fontSize:10,fontWeight:'900'},grid:{position:'relative',flexDirection:'row',justifyContent:'space-between',backgroundColor:'#0D1015',borderRadius:11,marginTop:15,padding:13},value:{color:'#FFF',fontSize:11,fontWeight:'800'},lockOverlay:{position:'absolute',inset:0,borderRadius:11,backgroundColor:'rgba(10,11,14,.72)',alignItems:'center',justifyContent:'center'},lockText:{color:gold,fontSize:11,fontWeight:'900'},cardFooter:{flexDirection:'row',justifyContent:'space-between',marginTop:13},pips:{color:green,fontSize:10,fontWeight:'900'},time:{color:'#707785',fontSize:9},fab:{position:'absolute',right:20,bottom:20,width:62,height:62,borderRadius:31,backgroundColor:'#00FFFF',alignItems:'center',justifyContent:'center'},fabText:{color:'#050505',fontSize:10,fontWeight:'900'},overlay:{flex:1,backgroundColor:'rgba(0,0,0,.7)',justifyContent:'flex-end'},sheet:{backgroundColor:'#171A20',borderTopLeftRadius:24,borderTopRightRadius:24,padding:25,alignItems:'center',gap:13},close:{position:'absolute',right:16,top:16,padding:8},aiIcon:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,213,90,.12)'},sheetTitle:{color:'#FFF',fontSize:21,fontWeight:'900'},sheetBody:{color:'#9BA3AE',fontSize:13,textAlign:'center'},sheetButton:{backgroundColor:gold,alignSelf:'stretch',padding:15,borderRadius:10,alignItems:'center',marginTop:8},sheetButtonText:{color:'#101217',fontSize:12,fontWeight:'900'} });
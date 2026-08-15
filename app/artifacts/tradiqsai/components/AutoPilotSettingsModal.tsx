import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';

type Risk = 'Conservative (1%)' | 'Moderate (2%)' | 'Aggressive (5%)';
const risks: Risk[] = ['Conservative (1%)', 'Moderate (2%)', 'Aggressive (5%)'];
const brokerKeys = ['Binance', 'MetaTrader 5', 'Interactive Brokers'];

export function AutoPilotSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [broker, setBroker] = useState('Connected to MetaTrader 5');
  const [risk, setRisk] = useState<Risk>('Moderate (2%)');
  const [maxTrades, setMaxTrades] = useState(2);
  const [lotSize, setLotSize] = useState('0.10');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void Promise.all(brokerKeys.map((name) => {
      const key = `tradiqs.broker-sync.${name.toLowerCase().replace(/\W+/g, '-')}`;
      return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
    })).then((connections) => {
      const index = connections.findIndex(Boolean);
      if (active && index >= 0) setBroker(`Connected to ${brokerKeys[index]}`);
    }).catch(() => {});
    return () => { active = false; };
  }, [visible]);

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.sheet}>
      <View style={s.header}><View><Text style={s.title}>AutoPilot Engine</Text><View style={s.live}><View style={s.liveDot}/><Text style={s.liveText}>LIVE</Text></View></View><TouchableOpacity onPress={onClose}><Feather name="x" size={22} color="#FFF"/></TouchableOpacity></View>
      <View style={s.broker}><Feather name="shield" size={18} color="#00E676"/><View><Text style={s.brokerLabel}>BROKER CONNECTION</Text><Text style={s.brokerValue}>{broker}</Text></View><Feather name="check-circle" size={17} color="#00E676"/></View>
      <Text style={s.section}>RISK PROFILE</Text><View style={s.risks}>{risks.map(option=><TouchableOpacity key={option} onPress={()=>setRisk(option)} style={[s.risk,risk===option&&s.riskOn]}><Text style={[s.riskText,risk===option&&s.riskTextOn]}>{option}</Text></TouchableOpacity>)}</View>
      <Text style={s.section}>MAX CONCURRENT TRADES</Text><View style={s.stepper}><TouchableOpacity disabled={maxTrades===1} onPress={()=>setMaxTrades(value=>Math.max(1,value-1))} style={s.step}><Feather name="minus" size={19} color="#FFF"/></TouchableOpacity><Text style={s.stepValue}>{maxTrades}</Text><TouchableOpacity disabled={maxTrades===5} onPress={()=>setMaxTrades(value=>Math.min(5,value+1))} style={s.step}><Feather name="plus" size={19} color="#FFF"/></TouchableOpacity></View>
      <Text style={s.section}>FIXED LOT / CONTRACT SIZE</Text><TextInput value={lotSize} onChangeText={setLotSize} keyboardType="decimal-pad" placeholder="0.10" placeholderTextColor="#707785" style={s.input}/>
      <View style={s.execution}><View><Text style={s.executionTitle}>Enable Automated Execution</Text><Text style={s.executionCopy}>Place approved trades automatically within your risk limits.</Text></View><Switch value={enabled} onValueChange={setEnabled} trackColor={{false:'#343943',true:'#00E676'}} thumbColor="#FFF"/></View>
      <TouchableOpacity style={s.save} onPress={onClose}><Feather name="save" size={17} color="#071014"/><Text style={s.saveText}>SAVE CONFIGURATION</Text></TouchableOpacity>
    </View></View>
  </Modal>;
}
const s=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,.72)',justifyContent:'flex-end'},sheet:{backgroundColor:'#15181E',borderTopLeftRadius:25,borderTopRightRadius:25,padding:22,gap:13},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},title:{color:'#FFF',fontSize:23,fontWeight:'900'},live:{flexDirection:'row',alignItems:'center',gap:5,marginTop:5},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:'#00E676'},liveText:{color:'#00E676',fontSize:9,fontWeight:'900',letterSpacing:1.2},broker:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0E1116',borderColor:'#29313A',borderWidth:1,borderRadius:12,padding:13},brokerLabel:{color:'#7C8490',fontSize:9,fontWeight:'900'},brokerValue:{color:'#FFF',fontSize:13,fontWeight:'700',marginTop:3,flex:1},section:{color:'#8E98A8',fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:3},risks:{flexDirection:'row',gap:6},risk:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:4,backgroundColor:'#222730',borderWidth:1,borderColor:'#303640',borderRadius:8},riskOn:{borderColor:'#00E676',backgroundColor:'rgba(0,230,118,.1)'},riskText:{color:'#9DA5B1',fontSize:9,fontWeight:'800',textAlign:'center'},riskTextOn:{color:'#00E676'},stepper:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#0E1116',borderRadius:11,padding:7},step:{width:40,height:36,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#282E38'},stepValue:{color:'#FFF',fontSize:20,fontWeight:'900'},input:{backgroundColor:'#0E1116',borderWidth:1,borderColor:'#303640',borderRadius:10,padding:13,color:'#FFF',fontWeight:'800'},execution:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:13,backgroundColor:'#0E1116',borderRadius:11},executionTitle:{color:'#FFF',fontWeight:'800',fontSize:13},executionCopy:{color:'#89919D',fontSize:10,lineHeight:14,marginTop:3,maxWidth:240},save:{backgroundColor:'#00E676',borderRadius:11,padding:15,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,marginTop:3},saveText:{color:'#071014',fontSize:12,fontWeight:'900'}});
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

const c = colors.light;
export function ReferralQRModal({ visible, code, onClose }: { visible: boolean; code: string; onClose: () => void }) {
  const cells = Array.from({ length: 121 }, (_, i) => ((i * 17 + i * i) % 7 < 3) || [0, 1, 10, 11, 12, 20, 21, 22, 109, 110, 119, 120].includes(i));
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.modal}><TouchableOpacity style={styles.close} onPress={onClose}><Feather name="x" size={20} color={c.foreground} /></TouchableOpacity><Text style={styles.title}>Scan to Join TradiQs AI</Text><View style={styles.qr}>{cells.map((active, i) => <View key={i} style={[styles.cell, active && styles.activeCell]} />)}</View><Text style={styles.code}>{code}</Text><Text style={styles.caption}>Invite code encoded for mobile signup</Text></View></View></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center' }, modal: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 22, alignItems: 'center', width: 300 }, close: { alignSelf: 'flex-end' }, title: { color: c.foreground, fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 18 }, qr: { width: 198, height: 198, padding: 8, backgroundColor: '#fff', flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '9.09%', height: '9.09%', backgroundColor: '#fff' }, activeCell: { backgroundColor: '#0A0B0E' }, code: { color: c.primary, fontFamily: 'monospace', fontSize: 15, marginTop: 16 }, caption: { color: c.mutedForeground, fontSize: 10, marginTop: 6 } });
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export function DeleteAccountModal({ visible, deleting = false, onClose, onConfirm }: { visible: boolean; deleting?: boolean; onClose: () => void; onConfirm: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => { if (!visible) setConfirmation(''); }, [visible]);
  const ready = confirmation === 'DELETE';
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.backdrop}><View style={s.sheet}>
      <View style={s.header}><View style={s.titleRow}><Text style={s.warning}>⚠</Text><Text style={s.title}>Delete Account</Text></View><TouchableOpacity onPress={onClose} accessibilityLabel="Cancel"><Text style={s.close}>×</Text></TouchableOpacity></View>
      <Text style={s.warningText}>This action is permanent and cannot be undone. All your simulated equity, trade history, and partner network data will be wiped.</Text>
      <TextInput style={s.input} placeholder="Type DELETE to confirm" placeholderTextColor="#8A8D93" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      <TouchableOpacity style={[s.deleteButton, !ready && s.disabled]} disabled={!ready || deleting} onPress={onConfirm}><Text style={s.deleteText}>Permanently Delete Account</Text></TouchableOpacity>
      <TouchableOpacity style={s.cancel} onPress={onClose}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#16181D', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: '#22252A', padding: 20, paddingBottom: 34, gap: 14 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, warning: { color: '#FF5252', fontSize: 22 }, title: { color: '#FFF', fontSize: 18, fontFamily: 'Inter_700Bold' }, close: { color: '#FFF', fontSize: 28 }, warningText: { color: '#C7C9CE', fontSize: 13, lineHeight: 20 }, input: { height: 48, backgroundColor: '#0A0B0E', borderWidth: 1, borderColor: '#22252A', borderRadius: 10, paddingHorizontal: 13, color: '#FFF', fontSize: 14 }, deleteButton: { height: 50, backgroundColor: '#FF5252', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: .5 }, deleteText: { color: '#0A0B0E', fontFamily: 'Inter_700Bold', fontSize: 13 }, cancel: { alignItems: 'center', padding: 4 }, cancelText: { color: '#8A8D93', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
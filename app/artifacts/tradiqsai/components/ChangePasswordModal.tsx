import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import colors from '@/constants/colors';

export function ChangePasswordModal({ visible, saving = false, onClose, onSubmit }: {
  visible: boolean; saving?: boolean; onClose: () => void; onSubmit: (current: string, next: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [verify, setVerify] = useState('');
  useEffect(() => { if (!visible) { setCurrent(''); setNext(''); setVerify(''); } }, [visible]);
  const mismatch = verify.length > 0 && next !== verify;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.backdrop}><View style={s.sheet}>
      <View style={s.header}><View><Text style={s.title}>Change Password</Text><Text style={s.subtitle}>Secure your institutional account.</Text></View><TouchableOpacity onPress={onClose} accessibilityLabel="Cancel"><Text style={s.close}>×</Text></TouchableOpacity></View>
      <Field label="Current Password" placeholder="Enter current password" value={current} onChangeText={setCurrent} />
      <Field label="New Password" placeholder="Enter new password" value={next} onChangeText={setNext} />
      <Field label="Verify New Password" placeholder="Re-enter new password" value={verify} onChangeText={setVerify} />
      {mismatch && <Text style={s.error}>Passwords do not match.</Text>}
      <TouchableOpacity style={[s.primary, (saving || !current || !next || !verify || mismatch) && s.disabled]} disabled={saving || !current || !next || !verify || mismatch} onPress={() => onSubmit(current, next)}><Text style={s.primaryText}>{saving ? <ActivityIndicator color="#0A0B0E" /> : 'Update Password'}</Text></TouchableOpacity>
    </View></View>
  </Modal>;
}
function Field({ label, placeholder, value, onChangeText }: { label: string; placeholder: string; value: string; onChangeText: (v: string) => void }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={s.input} placeholder={placeholder} placeholderTextColor="#8A8D93" value={value} onChangeText={onChangeText} secureTextEntry autoCapitalize="none" /></View>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#16181D', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: '#22252A', padding: 20, paddingBottom: 34, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }, title: { color: '#FFF', fontSize: 18, fontFamily: 'Inter_700Bold' }, subtitle: { color: colors.light.mutedForeground, fontSize: 11, marginTop: 4 }, close: { color: '#FFF', fontSize: 28, lineHeight: 24 },
  field: { gap: 6 }, label: { color: '#8A8D93', fontSize: 11, fontFamily: 'Inter_600SemiBold' }, input: { height: 48, backgroundColor: '#0A0B0E', borderWidth: 1, borderColor: '#22252A', borderRadius: 10, paddingHorizontal: 13, color: '#FFF', fontSize: 14 },
  error: { color: '#FF5252', fontSize: 11 }, primary: { height: 50, backgroundColor: '#00F0FF', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, disabled: { opacity: .5 }, primaryText: { color: '#0A0B0E', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
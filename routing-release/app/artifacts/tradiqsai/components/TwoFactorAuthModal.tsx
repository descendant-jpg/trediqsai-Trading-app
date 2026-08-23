import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/utils/supabase';
import colors from '@/constants/colors';

const c = colors.light;
type Props = {
  visible: boolean;
  onClose: () => void;
  onStatusChange: (enabled: boolean) => void;
  onVerified?: () => void;
};
type Factor = { id: string; status?: string; factor_type?: string };

export function TwoFactorAuthModal({ visible, onClose, onStatusChange, onVerified }: Props) {
  const [factor, setFactor] = useState<Factor | null>(null);
  const [secret, setSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [reverifyOpen, setReverifyOpen] = useState(false);
  const message = (title: string, body: string) => Alert.alert(title, body);
  const refresh = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const active = (data?.totp ?? []).find((item: Factor) => item.status === 'verified');
    setFactor(active ?? null); onStatusChange(Boolean(active));
  };
  useEffect(() => { if (visible) void refresh().catch((error: Error) => message('Two-factor authentication', error.message)); }, [visible]);
  const enroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'TradiQs AI' });
      if (error) throw error;
      setFactor({ id: data.id, status: 'unverified' });
      setSecret(data.totp.secret);
      setTotpUri(data.totp.uri);
    } catch (error: any) { message('Unable to start 2FA', error?.message ?? 'Enable TOTP MFA in Supabase and try again.'); } finally { setBusy(false); }
  };
  const copyManualCode = async () => {
    await Clipboard.setStringAsync(secret);
    message('Manual code copied', 'Paste this secret into your authenticator app.');
  };
  const verify = async () => {
    if (!factor || !/^\d{6}$/.test(code)) return message('Enter your code', 'Enter the six-digit code from your authenticator app.');
    const reVerifying = factor.status === 'verified';
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) throw error;
      if (!reVerifying) setRecoveryCodes((data as any)?.recovery_codes ?? []);
      await refresh();
      setCode('');
      setReverifyOpen(false);
      onVerified?.();
      message(
        reVerifying ? 'Session re-verified' : 'Two-factor authentication enabled',
        reVerifying
          ? 'Your security verification is current. AutoPilot history will refresh now.'
          : 'Your authenticator is now protecting this account.',
      );
    } catch (error: any) { message('Verification failed', error?.message ?? 'That code could not be verified.'); } finally { setBusy(false); }
  };
  const disable = async () => {
    if (!factor) return;
    setBusy(true);
    try { const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id }); if (error) throw error; setFactor(null); setSecret(''); onStatusChange(false); } catch (error: any) { message('Unable to disable 2FA', error?.message ?? 'Try again after verifying your current session.'); } finally { setBusy(false); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={s.backdrop}><ScrollView contentContainerStyle={s.card}><View style={s.header}><View><Text style={s.eyebrow}>ACCOUNT SECURITY</Text><Text style={s.title}>Two-Factor Auth</Text></View><TouchableOpacity onPress={onClose}><Feather name="x" size={23} color={c.foreground} /></TouchableOpacity></View>{factor?.status === 'verified' ? reverifyOpen ? <><Text style={s.enabled}>SESSION RE-VERIFICATION</Text><Text style={s.body}>Enter the current six-digit code from your authenticator app to refresh your security verification.</Text><TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={c.mutedForeground} style={s.input} testID="two-factor-reverify-code" /><TouchableOpacity disabled={busy} onPress={() => void verify()} style={s.primary} testID="two-factor-confirm-reverify"><Text style={s.primaryText}>{busy ? 'VERIFYING…' : 'VERIFY SESSION'}</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => setReverifyOpen(false)} style={s.manual}><Text style={s.manualText}>CANCEL</Text></TouchableOpacity></> : <><Text style={s.enabled}>STATUS: ENABLED</Text><Text style={s.body}>Your TradiQs account is protected with an authenticator app.</Text><TouchableOpacity disabled={busy} onPress={() => setReverifyOpen(true)} style={s.primary} testID="two-factor-reverify"><Text style={s.primaryText}>RE-VERIFY SESSION</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void disable()} style={s.danger}><Text style={s.dangerText}>DISABLE 2FA</Text></TouchableOpacity></> : !secret ? <><Text style={s.body}>Use Google Authenticator, Authy, or another TOTP authenticator to add a second verification step to your account.</Text><TouchableOpacity disabled={busy} onPress={() => void enroll()} style={s.primary}><Text style={s.primaryText}>{busy ? 'PREPARING…' : 'SET UP AUTHENTICATOR'}</Text></TouchableOpacity></> : <><Text style={s.body}>Scan this QR code with your authenticator app, then enter its current six-digit code.</Text><View style={s.qr}>{totpUri && <QRCode value={totpUri} size={184} color="#0A0B0E" backgroundColor="#FFFFFF" />}</View><TouchableOpacity onPress={() => void copyManualCode()} style={s.manual}><Text style={s.manualText}>COPY MANUAL CODE</Text></TouchableOpacity><View style={s.secret}><Text selectable style={s.secretText}>{secret}</Text></View><TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={c.mutedForeground} style={s.input} /><TouchableOpacity disabled={busy} onPress={() => void verify()} style={s.primary}><Text style={s.primaryText}>{busy ? 'VERIFYING…' : 'VERIFY & ENABLE'}</Text></TouchableOpacity></>}{recoveryCodes.length > 0 && <View style={s.recovery}><Text style={s.eyebrow}>RECOVERY CODES</Text><Text style={s.body}>Store these one-time codes somewhere secure.</Text><Text selectable style={s.codes}>{recoveryCodes.join('\n')}</Text></View>}</ScrollView></View></Modal>;
}
const s = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000B' }, card: { backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 38 }, header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }, eyebrow: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 }, title: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 5 }, body: { color: c.mutedForeground, lineHeight: 20, marginTop: 8 }, enabled: { color: c.success, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 4 }, primary: { backgroundColor: c.primary, borderRadius: 11, alignItems: 'center', padding: 15, marginTop: 22 }, primaryText: { color: c.primaryForeground, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 }, danger: { borderWidth: 1, borderColor: c.destructive, borderRadius: 11, alignItems: 'center', padding: 15, marginTop: 22 }, dangerText: { color: c.destructive, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 }, qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, marginTop: 18 }, manual: { borderWidth: 1, borderColor: c.primary, borderRadius: 10, alignItems: 'center', padding: 12, marginTop: 14 }, manualText: { color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 }, secret: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 12 }, secretText: { color: c.primary, fontFamily: 'monospace', fontSize: 15 }, input: { borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 10, color: c.foreground, fontSize: 22, letterSpacing: 8, textAlign: 'center', padding: 13, marginTop: 18 }, recovery: { borderTopWidth: 1, borderColor: c.border, marginTop: 24, paddingTop: 18 }, codes: { color: c.foreground, fontFamily: 'monospace', lineHeight: 21, marginTop: 12 } });
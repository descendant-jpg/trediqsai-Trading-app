import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/context/AuthContext';
import colors from '@/constants/colors';

const c = colors.light;

/** Blocks authenticated routes until an enrolled TOTP factor raises the session to AAL2. */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(() => Boolean(session));
  const [checkedToken, setCheckedToken] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!session) { setFactorId(null); setCheckedToken(null); setChecking(false); return; }
    setChecking(true);
    try {
      const [{ data: factors, error: factorsError }, { data: aal, error: aalError }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (factorsError || aalError) throw factorsError ?? aalError;
      const enrolled = factors?.totp?.find((factor: any) => factor.status === 'verified');
      setFactorId(enrolled?.id ?? null);
      if (!enrolled || aal?.currentLevel === 'aal2') setFactorId(null);
    } catch (error: any) {
      // A protected authenticated session must never become usable on an MFA
      // check failure. Keep the gate visible with a retry action.
      setFactorId('__error__');
      setMessage(error?.message ?? 'Unable to confirm your two-factor security. Check your connection and retry.');
    } finally { setCheckedToken(session.access_token); setChecking(false); }
  };
  useEffect(() => { void check(); }, [session?.access_token]);
  const verify = async () => {
    if (!factorId || !/^\d{6}$/.test(code)) { setMessage('Enter the six-digit code from your authenticator app.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      await check();
    } catch (error: any) { setMessage(error?.message ?? 'We could not verify that code.'); } finally { setBusy(false); }
  };
  if (!authLoading && !session) return <>{children}</>;
  // A session is never allowed through until this exact access token has had
  // its factor and assurance level evaluated.
  if (!checking && !factorId && checkedToken === session?.access_token) return <>{children}</>;
  const hasError = factorId === '__error__';
  return <View style={s.screen}><Text style={s.eyebrow}>ACCOUNT SECURITY</Text><Text style={s.title}>{checking ? 'Checking security…' : hasError ? 'Security check required' : 'Two-factor verification'}</Text>{checking ? <ActivityIndicator color={c.primary} style={{ marginTop: 22 }} /> : <><Text style={s.body}>{hasError ? 'We could not confirm your two-factor security. Try again before continuing.' : 'Enter the code from your authenticator to finish signing in.'}</Text>{!hasError && <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={c.mutedForeground} style={s.input} autoFocus />}<Text style={s.error}>{message}</Text><TouchableOpacity disabled={busy} style={s.button} onPress={() => void (hasError ? check() : verify())}><Text style={s.buttonText}>{busy ? 'VERIFYING…' : hasError ? 'RETRY SECURITY CHECK' : 'VERIFY & CONTINUE'}</Text></TouchableOpacity></>}</View>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: c.background, justifyContent: 'center', padding: 28 }, eyebrow: { color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 }, title: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 8 }, body: { color: c.mutedForeground, lineHeight: 20, marginTop: 10 }, input: { borderColor: c.border, borderWidth: 1, borderRadius: 10, color: c.foreground, backgroundColor: c.card, fontSize: 22, letterSpacing: 8, padding: 14, textAlign: 'center', marginTop: 22 }, error: { color: c.destructive, minHeight: 20, marginTop: 8 }, button: { backgroundColor: c.primary, borderRadius: 11, padding: 15, alignItems: 'center', marginTop: 10 }, buttonText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 } });
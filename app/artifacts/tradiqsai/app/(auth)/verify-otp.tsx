import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/context/AuthContext';
import colors from '@/constants/colors';

const c = colors.light;
const CYAN = '#00F0FF';
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Six-digit email verification for Supabase Custom SMTP OTP flows.
 * Reached from sign-up (fresh code just sent, `fresh=1`) or from sign-in
 * when the backend reports the email as unconfirmed.
 */
export default function VerifyOtpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ email?: string; fresh?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const inputRef = useRef<TextInput>(null);
  const verifyInFlight = useRef(false);
  const resendInFlight = useRef(false);
  const hadSessionAtMount = useRef(Boolean(session));

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Sign-up arrivals just had a code sent; sign-in arrivals may need an
  // immediate resend, so only the fresh path starts with the cooldown active.
  const [cooldown, setCooldown] = useState(
    params.fresh === '1' ? RESEND_COOLDOWN_SECONDS : 0,
  );

  // Backup routing only for a session ESTABLISHED AFTER this screen mounted
  // (i.e. by our verifyOtp call) — never for a stale pre-existing session,
  // and only when the session belongs to the email being verified.
  useEffect(() => {
    if (hadSessionAtMount.current || !session) return;
    const sessionEmail = session.user?.email?.toLowerCase();
    if (email && sessionEmail !== email.toLowerCase()) return;
    router.replace('/(tabs)' as never);
  }, [session, router, email]);

  // 60-second resend cooldown ticker.
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVerify = async (token: string) => {
    if (verifyInFlight.current || token.length !== CODE_LENGTH || !email) return;
    verifyInFlight.current = true;
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      });
      if (verifyError) {
        setError(
          /expired/i.test(verifyError.message)
            ? 'That code has expired. Request a new one below.'
            : 'Invalid code. Check the 6 digits and try again.',
        );
        setCode('');
        return;
      }
      // Session established — the session effect above also routes as backup.
      router.replace('/(tabs)' as never);
    } catch {
      setError('Verification failed. Check your connection and try again.');
      setCode('');
    } finally {
      verifyInFlight.current = false;
      setSubmitting(false);
    }
  };

  // Auto-submit the moment the 6th digit lands.
  useEffect(() => {
    if (code.length === CODE_LENGTH) void handleVerify(code);
  }, [code]);

  const handleResend = async () => {
    if (resendInFlight.current || cooldown > 0 || resending || !email) return;
    resendInFlight.current = true;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (resendError) throw resendError;
      setNotice('A fresh code is on its way to your inbox.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.message ?? 'Could not resend the code. Try again shortly.');
    } finally {
      resendInFlight.current = false;
      setResending(false);
    }
  };

  // Direct/malformed navigation without an email can never verify — route
  // back to sign in instead of dead-ending on an inert screen.
  useEffect(() => {
    if (!email) router.replace('/(auth)/login' as never);
  }, [email, router]);

  const handleChange = (text: string) => {
    setError(null);
    setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
  };

  return (
    <View style={[s.page, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          style={s.backButton}
        >
          <Feather name="arrow-left" size={22} color={c.foreground} />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <View style={s.iconWrap}>
          <Feather name="mail" size={26} color={CYAN} />
        </View>
        <Text style={s.title}>Verify Your Email</Text>
        <Text style={s.subtitle}>
          Enter the 6-digit code sent to{'\n'}
          <Text style={s.email}>{email || 'your email address'}</Text>
        </Text>

        <Pressable
          style={s.otpRow}
          onPress={() => inputRef.current?.focus()}
          accessibilityLabel="Six digit verification code"
        >
          {Array.from({ length: CODE_LENGTH }).map((_, index) => {
            const filled = index < code.length;
            const activeBox = index === code.length && !submitting;
            return (
              <View
                key={index}
                style={[s.otpBox, filled && s.otpBoxFilled, activeBox && s.otpBoxActive]}
              >
                <Text style={s.otpDigit}>{code[index] ?? ''}</Text>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus
          caretHidden
          style={s.hiddenInput}
          accessibilityLabel="Verification code"
          testID="otp-input"
        />

        {submitting && <ActivityIndicator color={CYAN} style={s.spinner} />}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {notice && !error ? <Text style={s.notice}>{notice}</Text> : null}

        <TouchableOpacity
          style={[s.verifyButton, (code.length !== CODE_LENGTH || submitting) && s.verifyButtonDisabled]}
          onPress={() => void handleVerify(code)}
          disabled={code.length !== CODE_LENGTH || submitting}
          accessibilityRole="button"
          testID="otp-verify"
        >
          <Text style={s.verifyText}>{submitting ? 'VERIFYING…' : 'VERIFY'}</Text>
        </TouchableOpacity>

        <View style={s.resendRow}>
          <Text style={s.resendHint}>Didn&apos;t receive the code? </Text>
          <TouchableOpacity
            onPress={() => void handleResend()}
            disabled={cooldown > 0 || resending}
            accessibilityRole="button"
            accessibilityLabel="Resend verification code"
            testID="otp-resend"
          >
            <Text style={[s.resendText, (cooldown > 0 || resending) && s.resendTextDisabled]}>
              {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0B0E' },
  header: { paddingHorizontal: 16 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#121824', borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 60 },
  iconWrap: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(0,229,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: c.foreground, fontSize: 24, fontFamily: 'Inter_700Bold' },
  subtitle: { color: c.mutedForeground, fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  email: { color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  otpRow: { flexDirection: 'row', gap: 9, marginTop: 30 },
  otpBox: { width: 46, height: 54, borderRadius: 12, backgroundColor: '#121824', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  otpBoxFilled: { borderColor: 'rgba(0,229,255,0.55)' },
  otpBoxActive: { borderColor: CYAN, shadowColor: CYAN, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  otpDigit: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  spinner: { marginTop: 18 },
  error: { color: '#FF6576', fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 18, textAlign: 'center' },
  notice: { color: '#5FF0A2', fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 18, textAlign: 'center' },
  verifyButton: { marginTop: 26, backgroundColor: CYAN, borderRadius: 12, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch' },
  verifyButtonDisabled: { opacity: 0.45 },
  verifyText: { color: '#071014', fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1 },
  resendRow: { flexDirection: 'row', marginTop: 22, alignItems: 'center' },
  resendHint: { color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_500Medium' },
  resendText: { color: CYAN, fontSize: 13, fontFamily: 'Inter_700Bold' },
  resendTextDisabled: { color: c.mutedForeground },
});

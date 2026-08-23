import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { extractReferralCode } from '@/lib/referralLink';
import { supabase } from '@/utils/supabase';
import { setPendingSignupUsername } from '@/context/AuthContext';
import colors from '@/constants/colors';

// Completes any pending auth session when the browser redirects back.
WebBrowser.maybeCompleteAuthSession();

/**
 * Cross-platform alert. RN's Alert.alert is a SILENT NO-OP on web, which
 * made auth errors invisible in the browser preview — always route through
 * this helper so errors surface on every platform.
 */
function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

const redirectTo = makeRedirectUri({
  scheme: 'tradiqsai',
  path: 'auth/callback',
});

/** Extract Supabase tokens from an OAuth redirect URL and set the session. */
async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return;
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) throw error;
}

/**
 * Authentication screen for TradiQs AI.
 * Sign In (email OR username) / Create Account modes, forgot password,
 * and Apple + Google social auth. Terminal Black aesthetic.
 */
export default function AuthScreen({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const [isLoginMode, setIsLoginMode] = useState(initialMode !== 'signup');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsLoginMode(initialMode !== 'signup');
  }, [initialMode]);

  // Referral deep links: opening https://tradiqsai.com/r/<code> (or the
  // tradiqsai:// scheme, or ?ref= on web) pre-fills the code and jumps to
  // the Create Account form so the invite loop closes without typing.
  const incomingUrl = Linking.useURL();

  useEffect(() => {
    const applyFromUrl = (url: string | null) => {
      const code = extractReferralCode(url);
      if (code) {
        setReferralCode(code);
        setIsLoginMode(false);
      }
    };
    if (incomingUrl) {
      applyFromUrl(incomingUrl);
    } else {
      // Cold start: useURL can miss the initial URL, so fetch it explicitly.
      Linking.getInitialURL().then(applyFromUrl).catch(() => {});
    }
  }, [incomingUrl]);

  const switchMode = () => {
    setIsLoginMode((m) => !m);
    setPassword('');
  };

  /** Resolve the sign-in identifier to an email (username → RPC lookup). */
  const resolveEmail = async (identifier: string): Promise<string> => {
    const value = identifier.trim();
    if (value.includes('@')) return value;
    const { data, error } = await supabase.rpc('get_email_for_username', {
      p_username: value,
    });
    if (error) throw error;
    if (!data) throw new Error('No account found with that username.');
    return data as string;
  };

  const handleSignIn = async () => {
    console.log('[Auth] handleSignIn pressed', {
      emailOrUsername,
      passwordLength: password.length,
    });
    if (!emailOrUsername.trim() || !password) {
      showAlert('Missing details', 'Enter your email/username and password.');
      return;
    }
    setLoading(true);
    try {
      const resolved = await resolveEmail(emailOrUsername);
      const { error } = await supabase.auth.signInWithPassword({
        email: resolved,
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      showAlert('Sign in failed', err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    console.log('[Auth] handleSignUp pressed', {
      username,
      email,
      passwordLength: password.length,
    });
    const name = username.trim();
    if (!name || !email.trim() || !password) {
      showAlert('Missing details', 'Username, email, and password are required.');
      return;
    }
    setLoading(true);
    try {
      const { data: taken, error: takenErr } = await supabase.rpc(
        'is_username_taken',
        { p_username: name },
      );
      if (takenErr) throw takenErr;
      if (taken) throw new Error('Username already taken.');

      // Stage the username BEFORE signUp: the session event fires during the
      // await, and the profile row (written by the handle_new_user trigger)
      // may not be readable yet. Staging it prevents the "Choose a Username"
      // prompt from flashing while that insert commits.
      setPendingSignupUsername(name);
      const refCode = referralCode.trim();
      const {
        data: { session },
        error,
      } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: name,
            ...(refCode ? { referral_code: refCode } : {}),
          },
        },
      });
      if (error) throw error;
      // The handle_new_user trigger inserts { user_id, username, email }
      // into profiles server-side — no client insert needed.
      if (!session) {
        // Email verification required — no session yet, so nothing consumed
        // the staged username. Clear it so it can't leak to another sign-in.
        setPendingSignupUsername(null);
        showAlert('Check your inbox', 'Please verify your email to continue.');
      }
    } catch (err: any) {
      setPendingSignupUsername(null);
      showAlert('Sign up failed', err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const value = emailOrUsername.trim();
    if (!value) {
      showAlert('Forgot password', 'Enter your email or username first.');
      return;
    }
    try {
      const resolved = await resolveEmail(value);
      const { error } = await supabase.auth.resetPasswordForEmail(resolved, {
        redirectTo,
      });
      if (error) throw error;
      showAlert('Check your inbox', 'We sent you a password reset link.');
    } catch (err: any) {
      showAlert('Reset failed', err?.message ?? 'Unknown error');
    }
  };

  const handleOAuthLogin = async (provider: 'apple' | 'google') => {
    if (loading) return;
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo },
        });
        if (error) throw error;
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Could not start the secure sign-in session.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        await createSessionFromUrl(result.url);
      }
    } catch (err: any) {
      showAlert(
        `${provider === 'apple' ? 'Apple' : 'Google'} sign in failed`,
        err?.message ?? 'Unknown error',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (err: any) {
      showAlert('Guest access failed', err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>TradiQs AI</Text>
        <Text style={styles.subtitle}>
          {isLoginMode
            ? 'Sign in to enter the trading floor.'
            : 'Create your account to start trading.'}
        </Text>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            onPress={() => !isLoginMode && switchMode()}
            testID="auth-mode-signin"
          >
            <Text
              style={[styles.modeText, isLoginMode && styles.modeTextActive]}
            >
              Sign In
            </Text>
          </TouchableOpacity>
          <Text style={styles.modeDivider}>/</Text>
          <TouchableOpacity
            onPress={() => isLoginMode && switchMode()}
            testID="auth-mode-signup"
          >
            <Text
              style={[styles.modeText, !isLoginMode && styles.modeTextActive]}
            >
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {isLoginMode ? (
            <TextInput
              style={styles.input}
              placeholder="Email or Username"
              placeholderTextColor="#8A8D93"
              value={emailOrUsername}
              onChangeText={setEmailOrUsername}
              autoCapitalize="none"
              autoComplete="username"
              testID="auth-identifier"
            />
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Choose Username"
                placeholderTextColor="#8A8D93"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                testID="auth-username"
              />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#8A8D93"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                testID="auth-email"
              />
              <TextInput
                style={styles.input}
                placeholder="Referral Code (optional)"
                placeholderTextColor="#8A8D93"
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
                autoCorrect={false}
                testID="auth-referral-code"
              />
            </>
          )}
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#8A8D93"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            testID="auth-password"
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={isLoginMode ? handleSignIn : handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
            testID="auth-submit"
          >
            {loading ? (
              <ActivityIndicator color="#0A0B0E" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLoginMode ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {isLoginMode && (
            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotWrap}
              testID="auth-forgot"
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          {/* OR separator */}
          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>OR</Text>
            <View style={styles.separatorLine} />
          </View>

          {/* Social auth */}
          <TouchableOpacity
            style={[styles.appleButton, loading && styles.disabled]}
            onPress={() => void handleOAuthLogin('apple')}
            disabled={loading}
            activeOpacity={0.85}
            testID="auth-apple"
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : (
              <Text style={styles.appleButtonText}>Continue with Apple</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.googleButton, loading && styles.disabled]}
            onPress={() => void handleOAuthLogin('google')}
            disabled={loading}
            activeOpacity={0.85}
            testID="auth-google"
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleGuestLogin()}
            disabled={loading}
            style={styles.guestButton}
            testID="auth-guest"
          >
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
          </TouchableOpacity>
          <View style={styles.trustBadges} accessibilityLabel="Bank-grade security, AI-powered edge, and global markets">
            <Text style={styles.trustBadge}>🛡️ Bank-Grade Security</Text>
            <Text style={styles.trustBadge}>🧠 AI-Powered Edge</Text>
            <Text style={styles.trustBadge}>🌍 Global Markets</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
  },
  modeText: {
    color: '#8A8D93',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  modeTextActive: {
    color: '#00F0FF',
  },
  modeDivider: {
    color: '#22252A',
    fontSize: 15,
  },
  form: {
    marginTop: 26,
    gap: 14,
  },
  trustBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  trustBadge: { color: '#8A8D93', fontSize: 10, fontFamily: 'Inter_500Medium' },
  input: {
    backgroundColor: '#16181D',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  primaryButton: {
    height: 54,
    borderRadius: colors.radius,
    backgroundColor: '#00F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#0A0B0E',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  forgotWrap: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
  forgotText: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#22252A',
  },
  separatorText: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
  },
  appleButton: {
    height: 54,
    borderRadius: colors.radius,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  googleButton: {
    height: 54,
    borderRadius: colors.radius,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googleIcon: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  guestButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  guestButtonText: {
    color: '#8A8D93',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  disabled: {
    opacity: 0.6,
  },
});

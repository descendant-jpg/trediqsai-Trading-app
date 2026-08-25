import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createSessionFromUrl } from '@/utils/supabase';

const CYAN = '#00F0FF';

/**
 * OAuth return target for WEB sign-in. Native Google/Apple sign-in resolves
 * inside the in-app browser session (skipBrowserRedirect) and never lands
 * here; the web flow redirects the whole page to <origin>/auth/callback, so
 * this route parses the tokens from the URL (the client runs with
 * detectSessionInUrl: false) and enters the app. Without it, returning users
 * hit the +not-found screen after a successful Google consent.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      router.replace('/(auth)/login' as never);
      return;
    }
    createSessionFromUrl(window.location.href)
      .then(() => router.replace('/(tabs)' as never))
      .catch((err: any) =>
        setFailure(err?.message ?? 'Sign-in could not be completed.'),
      );
  }, [router]);

  if (failure) {
    return (
      <View style={s.page}>
        <Text style={s.title}>Sign-in failed</Text>
        <Text style={s.body}>{failure}</Text>
        <TouchableOpacity
          style={s.button}
          onPress={() => router.replace('/(auth)/login' as never)}
          accessibilityRole="button"
          testID="auth-callback-retry"
        >
          <Text style={s.buttonText}>BACK TO SIGN IN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.page} testID="auth-callback-loading">
      <ActivityIndicator color={CYAN} size="large" />
      <Text style={s.body}>Completing sign-in…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0A0B0E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    marginBottom: 10,
  },
  body: {
    color: '#9BA1A6',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 26,
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: '#071014',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
});

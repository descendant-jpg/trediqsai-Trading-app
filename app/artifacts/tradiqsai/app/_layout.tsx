import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@/lib/platform-pay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { TradingProvider } from '@/context/TradingContext';
import AuthScreen from '@/screens/AuthScreen';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { usePendingRouteRedirect } from '@/lib/usePendingRouteRedirect';
import * as SplashScreen from 'expo-splash-screen';
import {
  setAuthFailureHandler,
  setAuthSessionRefresher,
  setAuthTokenGetter,
  customFetch,
} from '@workspace/api-client-react';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// Attach the Supabase access token to every API call so server-side state
// (e.g. AutoPilot bot settings) is scoped to the signed-in trader.
setAuthTokenGetter(async () => {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

// When the API rejects a token (401) — e.g. it expired while the app was
// backgrounded — force a session refresh so the request can be retried once
// with a fresh token.
setAuthSessionRefresher(async () => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
});

// If the refresh fails (or the retry still 401s) the session is beyond
// recovery: sign out so the app routes to the sign-in screen instead of
// leaving a dead error state.
setAuthFailureHandler(async () => {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
});

const queryClient = new QueryClient();

type AutoPilotReadiness = { ready: boolean; missing: string[] };

/**
 * The app never probes private Supabase metadata using its public key. Instead
 * it asks the API's read-only readiness endpoint once per app mount. A clear
 * warning is much safer than allowing the AutoPilot deploy screen to be the
 * first place an unapplied migration becomes a trader-facing failure.
 */
function useAutoPilotDependencyWarning() {
  useEffect(() => {
    let mounted = true;
    void customFetch<AutoPilotReadiness>('/api/health/autopilot')
      .then((status) => {
        if (!mounted || status.ready) return;
        const missing = status.missing.length
          ? status.missing.join(', ')
          : 'required Supabase objects';
        Alert.alert(
          'AutoPilot setup required',
          `AutoPilot is unavailable until the database setup is applied: ${missing}.`,
        );
      })
      .catch(() => {
        if (!mounted) return;
        Alert.alert(
          'AutoPilot status unavailable',
          'The app could not verify its AutoPilot database setup. Deployments may be unavailable.',
        );
      });
    return () => { mounted = false; };
  }, []);
}

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const router = useRouter();

  // Server-side state is per-user: drop cached API data whenever the
  // signed-in user changes so one trader never sees another's data.
  const userId = session?.user?.id ?? null;
  usePushNotifications(userId);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      initializeRevenueCat();
    } catch (err: unknown) {
      Alert.alert('RevenueCat Unavailable', err instanceof Error ? err.message : 'Unknown error');
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const signalId = response.notification.request.content.data?.signal_id;
      if (typeof signalId !== 'string' && typeof signalId !== 'number') return;

      router.push({
        pathname: '/(tabs)/signals',
        params: { highlight_id: String(signalId) },
      });
    });

    return () => subscription.remove();
  }, [router]);
  const prevUserId = React.useRef(userId);
  useEffect(() => {
    if (prevUserId.current !== userId) {
      prevUserId.current = userId;
      queryClient.clear();
    }
  }, [userId]);

  // Preserve a signed-out user's deep-link destination and land there
  // after a successful sign-in (including legacy Oracle chat links).
  usePendingRouteRedirect(session, loading);

  // Hold on the splash-colored blank frame while the stored session restores,
  // so signed-in users don't flash the sign-in screen on launch.
  if (loading) return null;

  if (!session) return <AuthScreen />;

  // Usernames are now assigned server-side (from the email prefix) — no
  // manual username prompt; signed-in users go straight to the app.

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="oracle" options={{ headerShown: false }} />
      <Stack.Screen name="notification-settings" options={{ headerShown: false }} />
      <Stack.Screen name="session-intelligence" options={{ headerShown: false }} />
      <Stack.Screen name="economic-calendar" options={{ headerShown: false }} />
      <Stack.Screen name="vip-signals" options={{ headerShown: false }} />
      <Stack.Screen name="shop" options={{ headerShown: false }} />
      <Stack.Screen name="community" options={{ headerShown: false }} />
      <Stack.Screen name="trading-arcade" options={{ headerShown: false }} />
      <Stack.Screen name="quotes" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="trade-journal" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="partner-program" options={{ headerShown: false }} />
      <Stack.Screen name="refer-and-earn" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Custom fonts are progressive enhancement. The provider tree must mount
  // immediately with platform-font fallback if font loading is slow.
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timeout = setTimeout(() => setFontLoadTimedOut(true), 5_000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  // Fetch the Stripe publishable key from the server so it is never baked
  // into the bundle as a hardcoded string.
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('');
  useAutoPilotDependencyWarning();
  useEffect(() => {
    customFetch<{ publishableKey: string }>('/api/payment/config')
      .then(({ publishableKey }) => {
        if (publishableKey) setStripePublishableKey(publishableKey);
      })
      .catch(() => {
        // Non-fatal: StripeProvider will render with an empty key and log a
        // warning, but the rest of the app continues to work normally.
      });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SplashScreen.preventAutoHideAsync();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      if (Platform.OS !== 'web') void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);


  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StripeProvider publishableKey={stripePublishableKey}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthProvider>
                  {/* SubscriptionProvider is inside AuthProvider so its
                      useSubscriptionContext can call useAuth() to read the
                      Supabase subscription_tier for Stripe Elite buyers. */}
                  <SubscriptionProvider>
                    <TradingProvider>
                      <RootLayoutNav />
                    </TradingProvider>
                  </SubscriptionProvider>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </StripeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
  },
  bootTitle: {
    color: '#00FF00',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 3,
  },
  bootStatus: {
    marginTop: 12,
    color: '#8A8A8A',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});

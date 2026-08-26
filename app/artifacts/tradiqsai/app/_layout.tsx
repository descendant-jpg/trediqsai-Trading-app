import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@/lib/platform-pay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { TradingProvider } from '@/context/TradingContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as Font from 'expo-font';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { usePendingRouteRedirect } from '@/lib/usePendingRouteRedirect';
import * as SplashScreen from 'expo-splash-screen';
import {
  setAuthFailureHandler,
  setAuthSessionRefresher,
  setAuthTokenGetter,
  setBaseUrl,
  customFetch,
} from '@workspace/api-client-react';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { getNotificationRoute } from '@/services/NotificationService';
import { BiometricLock } from '@/components/BiometricLock';
import { MfaGate } from '@/components/MfaGate';
import { DegradedSecurityNoticeProvider } from '@/components/DegradedSecurityNoticeProvider';
import { AnimatedBootScreen } from '@/components/AnimatedBootScreen';

// Navigation must paint the same dark canvas as the app shell. The default
// (light) React Navigation theme is what flashes white when the (auth) group
// swaps to (tabs); override background/card to the app's terminal black.
const AppDarkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#0A0B0E', card: '#0A0B0E' },
};

// Expo web is served by Metro and native has no browser origin; neither is
// the Express API service. Always use the explicit API origin when supplied.
const configuredApi = process.env.EXPO_PUBLIC_API_URL;
console.log('[API Base URL]', configuredApi ?? '(not configured)');
setBaseUrl(configuredApi ?? null);

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

// Hold the native splash until the animated boot screen has mounted so the
// app never paints a white frame between the splash and the first screen.
if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

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
    if (loading || !session || Platform.OS === 'web') return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      const route = getNotificationRoute(data);
      if (route) {
        router.push(route as never);
        return;
      }

      const signalId = data?.signal_id;
      if (typeof signalId === 'string' || typeof signalId === 'number') {
        // Deep link straight into the institutional signal view; the server
        // re-checks entitlement before returning premium targets.
        router.push({
          pathname: '/signals/[id]',
          params: { id: String(signalId) },
        });
      }
    };

    // Launch always lands at Home after session restoration. Only notification
    // taps received after the running app has completed that landing may open
    // a destination, so a stale terminated-app response cannot override Home.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });

    return () => {
      subscription.remove();
    };
  }, [loading, router, session]);
  const sessionCacheScope = `${userId ?? 'signed-out'}:${session?.user?.is_anonymous === true ? 'guest' : 'account'}`;
  const previousSessionCacheScope = React.useRef(sessionCacheScope);
  useLayoutEffect(() => {
    if (previousSessionCacheScope.current !== sessionCacheScope) {
      previousSessionCacheScope.current = sessionCacheScope;
      queryClient.clear();
    }
  }, [sessionCacheScope]);

  // Route every auth-state transition through a single, deterministic landing
  // policy. Session restoration and sign-in always begin at Home; a signed-out
  // route always begins at the login gateway.
  usePendingRouteRedirect(session, loading);

  // Hold on the splash-colored blank frame while the stored session restores,
  // so signed-in users don't flash the sign-in screen on launch.
  if (loading) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0B0E' }}>
      <ThemeProvider value={AppDarkTheme}>
    <Stack initialRouteName="index" screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/verify-otp" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
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
      <Stack.Screen name="session-details" options={{ headerShown: false }} />
    </Stack>
      </ThemeProvider>
    </View>
  );
}

export default function RootLayout() {
  // Inter is progressive enhancement. In particular, fontfaceobserver can
  // reject in web previews when an asset misses its six-second deadline. Catch
  // that rejection here, then keep rendering with React Native's system-font
  // fallback instead of making the root navigation depend on a custom font.
  useEffect(() => {
    Font.loadAsync({
      Inter_400Regular,
      Inter_500Medium,
      Inter_600SemiBold,
      Inter_700Bold,
    }).catch((error) => {
      console.warn('Custom fonts were unavailable; using system fonts instead.', error);
    });
  }, []);

  // The animated boot curtain covers first paint, then crossfades into the
  // navigation tree underneath it — no white flash, no re-render handoff.
  const [bootComplete, setBootComplete] = useState(false);
  // Stable identities: a provider re-render (e.g. Stripe key arriving) must
  // never restart the boot animation timeline.
  const handleBootReady = useCallback(() => {
    if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => {});
  }, []);
  const handleBootFinish = useCallback(() => setBootComplete(true), []);

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

  return (
    <View style={rootStyles.root}>
      <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StripeProvider publishableKey={stripePublishableKey}>
            <GestureHandlerRootView style={rootStyles.root}>
              <KeyboardProvider>
                <AuthProvider>
                  {/* SubscriptionProvider is inside AuthProvider so its
                      useSubscriptionContext can call useAuth() to read the
                      Supabase subscription_tier for Stripe Elite buyers. */}
                  <SubscriptionProvider>
                      <TradingProvider>
                        <BiometricLock><MfaGate><RootLayoutNav /></MfaGate></BiometricLock>
                      </TradingProvider>
                  </SubscriptionProvider>
                </AuthProvider>
              </KeyboardProvider>
              <DegradedSecurityNoticeProvider />
            </GestureHandlerRootView>
          </StripeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
      </SafeAreaProvider>
      {!bootComplete && (
        <AnimatedBootScreen onReady={handleBootReady} onFinish={handleBootFinish} />
      )}
    </View>
  );
}

const rootStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0B0E' },
});

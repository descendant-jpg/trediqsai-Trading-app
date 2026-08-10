import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { Stack } from 'expo-router';
import { usePendingRouteRedirect } from '@/lib/usePendingRouteRedirect';
import * as SplashScreen from 'expo-splash-screen';
import {
  setAuthFailureHandler,
  setAuthSessionRefresher,
  setAuthTokenGetter,
} from '@workspace/api-client-react';
import { isSupabaseConfigured, supabase } from '@/utils/supabase';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';

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

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

try {
  initializeRevenueCat();
} catch (err: any) {
  Alert.alert('RevenueCat Unavailable', err?.message ?? 'Unknown error');
}

// Show local notifications (e.g. the settings screen's test notification)
// while the app is in the foreground — without this they are suppressed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { session, loading } = useAuth();

  // Server-side state is per-user: drop cached API data whenever the
  // signed-in user changes so one trader never sees another's data.
  const userId = session?.user?.id ?? null;
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SubscriptionProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthProvider>
                  <TradingProvider>
                    <RootLayoutNav />
                  </TradingProvider>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </SubscriptionProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

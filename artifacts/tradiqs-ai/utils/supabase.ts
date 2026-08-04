import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/**
 * Supabase client for TradiQs AI.
 * Auth sessions persist to standard React Native storage
 * (localStorage, backed by expo-sqlite via the install shim above).
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the auth session fresh: Supabase Auth continuously refreshes tokens
// while the app is in the foreground and stops when it goes to background.
// Guarded on globalThis so dev fast-refresh doesn't stack duplicate listeners.
declare global {
  // eslint-disable-next-line no-var
  var __supabaseAppStateHooked: boolean | undefined;
}

if (!globalThis.__supabaseAppStateHooked) {
  globalThis.__supabaseAppStateHooked = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

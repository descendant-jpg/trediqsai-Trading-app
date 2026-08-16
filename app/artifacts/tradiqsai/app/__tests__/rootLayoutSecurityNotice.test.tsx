// @vitest-environment jsdom
/**
 * Integration test: verifies that DegradedSecurityNoticeProvider is mounted
 * inside RootLayout and that triggering the degraded-security handler makes
 * the `degraded-security-notice` banner appear in the tree.
 *
 * This catches regressions where <DegradedSecurityNoticeProvider /> is
 * accidentally removed or misplaced in the root layout — all unit tests for
 * the component itself would still pass, but users would never see the banner.
 */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Hoist shared mutable state --------------------------------------------

/**
 * Capture the handler registered by DegradedSecurityNoticeProvider so tests
 * can trigger it directly — identical pattern to the component unit tests.
 */
const handlerRef = vi.hoisted(
  () => ({ fn: null as null | ((ctx: { url: string; method: string }) => void) }),
);

// ---- Module mocks (must be declared before the module under test is imported)

vi.mock('@workspace/api-client-react', () => ({
  setDegradedSecurityHandler: (
    handler: ((ctx: { url: string; method: string }) => void) | null,
  ) => {
    handlerRef.fn = handler;
  },
  setAuthFailureHandler: vi.fn(),
  setAuthSessionRefresher: vi.fn(),
  setAuthTokenGetter: vi.fn(),
  setBaseUrl: vi.fn(),
  customFetch: vi.fn(async () => ({})),
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

vi.mock('@/utils/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(),
    },
  },
}));

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ session: null, loading: false }),
}));

vi.mock('@/context/TradingContext', () => ({
  TradingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/revenuecat', () => ({
  initializeRevenueCat: vi.fn(),
  SubscriptionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/platform-pay', () => ({
  StripeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/BiometricLock', () => ({
  BiometricLock: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/MfaGate', () => ({
  MfaGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/screens/AuthScreen', () => ({
  default: () => null,
}));

vi.mock('expo-font', () => ({
  loadAsync: vi.fn(async () => {}),
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getLastNotificationResponseAsync: vi.fn(async () => null),
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
}));

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(async () => {}),
  hideAsync: vi.fn(async () => {}),
}));

vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({
    children,
    style,
  }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) => <div style={style}>{children}</div>,
}));

vi.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/usePendingRouteRedirect', () => ({
  usePendingRouteRedirect: vi.fn(),
}));

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}));

vi.mock('@/services/NotificationService', () => ({
  getNotificationRoute: vi.fn(() => null),
}));

vi.mock('@expo-google-fonts/inter', () => ({
  Inter_400Regular: {},
  Inter_500Medium: {},
  Inter_600SemiBold: {},
  Inter_700Bold: {},
}));

// ---- Import after mocks ----------------------------------------------------

import RootLayout from '../_layout';

// ---- Helpers ----------------------------------------------------------------

function triggerDegraded(url: string, method: string) {
  handlerRef.fn?.({ url, method });
}

// ---- Setup / teardown -------------------------------------------------------

beforeEach(() => {
  handlerRef.fn = null;
});

afterEach(() => {
  cleanup();
});

// ---- Tests ------------------------------------------------------------------

describe('RootLayout — DegradedSecurityNoticeProvider integration', () => {
  it('mounts DegradedSecurityNoticeProvider so the degraded-security handler is registered', async () => {
    render(<RootLayout />);
    // If the provider is present in the tree the handler will be registered.
    await waitFor(() => expect(handlerRef.fn).not.toBeNull());
  });

  it('shows the degraded-security-notice banner when the handler is triggered', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(handlerRef.fn).not.toBeNull());

    expect(screen.queryByTestId('degraded-security-notice')).toBeNull();

    await act(async () => {
      triggerDegraded('/api/autopilot/master', 'PUT');
    });

    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });

  it('does not show the banner before any degraded response arrives', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(handlerRef.fn).not.toBeNull());
    expect(screen.queryByTestId('degraded-security-notice')).toBeNull();
  });

  it('shows the banner for a bot settings write in degraded mode', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(handlerRef.fn).not.toBeNull());

    await act(async () => {
      triggerDegraded('/api/bots', 'POST');
    });

    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });
});

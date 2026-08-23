// @vitest-environment jsdom
/**
 * Integration test: verifies that BiometricLock is mounted inside RootLayout
 * using a dedicated single-component spy — the same vi.fn pattern used for
 * DegradedSecurityNoticeProvider in rootLayoutDegradedSecurityGate.test.tsx.
 *
 * This catches regressions where <BiometricLock /> is silently removed from
 * the layout. Component-level unit tests and the combined gate test in
 * rootLayoutAuthGates.test.tsx would still pass in that case, so a direct
 * single-spy mount check is a clearer, more granular guard.
 */
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Hoist shared mutable spy (must be before vi.mock calls) ----------------

const biometricLockSpy = vi.hoisted(() => vi.fn());

// ---- Module mocks (must be declared before the module under test imports) ---

vi.mock('@workspace/api-client-react', () => ({
  setDegradedSecurityHandler: vi.fn(),
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

/**
 * BiometricLock: record the call via the spy but still render children so the
 * rest of the tree can mount normally.
 */
vi.mock('@/components/BiometricLock', () => ({
  BiometricLock: ({ children }: { children: React.ReactNode }) => {
    biometricLockSpy();
    return <>{children}</>;
  },
}));

vi.mock('@/components/MfaGate', () => ({
  MfaGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/DegradedSecurityNoticeProvider', () => ({
  DegradedSecurityNoticeProvider: () => null,
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

// ---- Import after mocks -----------------------------------------------------

import RootLayout from '../_layout';

// ---- Setup / teardown -------------------------------------------------------

beforeEach(() => {
  biometricLockSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

// ---- Tests ------------------------------------------------------------------

describe('RootLayout — BiometricLock mount guard', () => {
  it('mounts BiometricLock in the render tree', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(biometricLockSpy).toHaveBeenCalled());
  });
});

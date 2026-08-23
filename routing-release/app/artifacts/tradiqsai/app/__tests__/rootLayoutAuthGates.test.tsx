// @vitest-environment jsdom
/**
 * Integration test: verifies that BiometricLock and MfaGate are mounted
 * inside RootLayout and wrap RootLayoutNav.
 *
 * This catches regressions where either gate component is accidentally removed
 * or misplaced in the root layout — all unit tests for those components would
 * still pass, but the security gate would be silently bypassed for every
 * signed-in user.
 */
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Hoist shared mutable spies (must be before vi.mock calls) --------------

const biometricLockSpy = vi.hoisted(() => vi.fn());
const mfaGateSpy = vi.hoisted(() => vi.fn());

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
 * rest of the tree (including MfaGate) can mount normally.
 */
vi.mock('@/components/BiometricLock', () => ({
  BiometricLock: ({ children }: { children: React.ReactNode }) => {
    biometricLockSpy();
    return <>{children}</>;
  },
}));

/**
 * MfaGate: same pattern — record then pass through.
 */
vi.mock('@/components/MfaGate', () => ({
  MfaGate: ({ children }: { children: React.ReactNode }) => {
    mfaGateSpy();
    return <>{children}</>;
  },
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
  mfaGateSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

// ---- Tests ------------------------------------------------------------------

describe('RootLayout — BiometricLock and MfaGate auth gate integration', () => {
  it('mounts BiometricLock in the render tree', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(biometricLockSpy).toHaveBeenCalled());
  });

  it('mounts MfaGate in the render tree', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(mfaGateSpy).toHaveBeenCalled());
  });

  it('mounts both BiometricLock and MfaGate together', async () => {
    render(<RootLayout />);
    await waitFor(() => {
      expect(biometricLockSpy).toHaveBeenCalled();
      expect(mfaGateSpy).toHaveBeenCalled();
    });
  });
});

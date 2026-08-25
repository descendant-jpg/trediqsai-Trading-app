// @vitest-environment jsdom
/**
 * Pro-gating tests for the AI Tools screen ("tease and convert").
 *
 * Policy under test:
 *   - Free users see the whole AutoPilot widget (summary, console, P&L
 *     history) under a touch-blocking ProPaywallOverlay with an Upgrade CTA.
 *   - For free users the master switch is forced off + disabled, all asset
 *     pills are disabled, and logs/P&L render zeroed static data.
 *   - "Ask AI Oracle" routes free users to the paywall, Pro users to /oracle.
 *   - Pro users see no overlay and get live data + full interactivity.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Hoisted state ----------------------------------------------------------

const subscriptionState = vi.hoisted(() => ({
  isSubscribed: false,
  isAdmin: false,
  accessTier: 'starter' as 'starter' | 'pro' | 'elite' | undefined,
}));
const routerPushMock = vi.hoisted(() => vi.fn());
const routerReplaceMock = vi.hoisted(() => vi.fn());
const paywallRenderSpy = vi.hoisted(() => vi.fn());
const updateBotMutateMock = vi.hoisted(() => vi.fn());

const AUTOPILOT_STATE = vi.hoisted(() => ({
  masterActive: true,
  selectedAsset: 'Forex',
  todayPnl: 123.45,
  logs: [{ id: 'log-1', time: '12:00', text: '[SIM] GRID Alpha: BUY setup filled in simulation' }],
  bots: [
    {
      id: 'bot-1',
      name: 'GRID Alpha',
      tags: 'Forex · Grid',
      risk: 'Low',
      capital: 10000,
      drawdown: 10,
      winRate: '68%',
      return30d: '+12.4%',
      totalTrades: 1204,
      proOnly: false,
      running: true,
    },
  ],
}));

// ---- Module mocks -----------------------------------------------------------

vi.mock('@workspace/api-client-react', () => ({
  getGetAutopilotQueryKey: () => ['autopilot'],
  getGetAutopilotHistoryQueryKey: () => ['autopilot-history'],
  useGetAutopilot: () => ({
    data: AUTOPILOT_STATE,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetAutopilotHistory: () => ({
    data: { days: [{ day: '2026-08-24', pnl: 45.5 }] },
    error: null,
  }),
  useSetAutopilotMaster: () => ({ mutate: vi.fn() }),
  useSetAutopilotAsset: () => ({ mutate: vi.fn() }),
  useUpdateAutopilotBot: () => ({ mutate: updateBotMutateMock }),
  useClearAutopilotLogs: () => ({ mutate: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), getQueryData: vi.fn(() => undefined) }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
  useLocalSearchParams: () => ({}),
}));

vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscriptionState,
}));

vi.mock('expo-blur', async () => {
  const React = await import('react');
  const { View } = await import('react-native');
  return {
    BlurView: (props: { children?: React.ReactNode }) =>
      React.createElement(View, props, props.children),
  };
});

vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  launchCameraAsync: vi.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: true })),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  selectionAsync: vi.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Warning: 'warning', Success: 'success' },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));

vi.mock('@/components/PaywallModal', () => ({
  PaywallModal: (props: { visible: boolean; onClose: () => void }) => {
    paywallRenderSpy(props);
    return null;
  },
}));

vi.mock('@/components/AiToolModal', () => ({ AiToolModal: () => null }));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null, Ionicons: () => null }));

import AiToolsScreen from '../(tabs)/ai-tools';

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  subscriptionState.isSubscribed = false;
  subscriptionState.isAdmin = false;
  subscriptionState.accessTier = 'starter';
});

afterEach(() => {
  cleanup();
});

describe('AI Tools — free user paywall', () => {
  it('covers the AutoPilot widget with the touch-blocking Pro overlay', () => {
    render(<AiToolsScreen />);

    const overlay = screen.getByTestId('autopilot-paywall-overlay');
    expect(overlay).toBeTruthy();
    expect(screen.getByText('PRO FEATURE')).toBeTruthy();
    expect(screen.getByText('Upgrade to unlock AI AutoPilot & Scalp Oracle')).toBeTruthy();
    expect(overlay.getAttribute('aria-label')).toContain('Pro feature locked');
    // The conversion CTA lives inside the curtain covering the widget.
    const cta = screen.getByTestId('autopilot-paywall-overlay-upgrade');
    expect(overlay.contains(cta)).toBe(true);
  });

  it('blocks interaction with the blurred controls underneath', () => {
    render(<AiToolsScreen />);

    // Clicking the covered master switch must do nothing: the switch is
    // disabled and the overlay's touch responder swallows the gesture.
    fireEvent.click(screen.getByTestId('master-toggle'));
    expect(screen.getByText('System Paused')).toBeTruthy();
    expect(
      paywallRenderSpy.mock.calls.some(([props]) => props.visible === true),
    ).toBe(false);
    // Covered asset pills stay inert as well — no paywall, no navigation.
    fireEvent.click(screen.getByTestId('autopilot-asset-crypto'));
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('forces the master switch off and disabled, and zeroes live data', () => {
    render(<AiToolsScreen />);

    const toggle = screen.getByTestId('master-toggle');
    // RNW Switch renders a hidden checkbox input carrying the real state.
    const input = toggle.querySelector('input');
    expect(input?.checked).toBe(false);
    expect(input?.disabled).toBe(true);
    expect(screen.getByText('System Paused')).toBeTruthy();
    expect(screen.getByText('0 Running')).toBeTruthy();
    expect(screen.getByText('+$0.00')).toBeTruthy();
    // Real logs/P&L must not reach the free render tree.
    expect(screen.queryByText(/GRID Alpha: BUY setup filled/)).toBeNull();
    expect(screen.queryByText('+$45.50')).toBeNull();
  });

  it('disables every asset pill for free users', () => {
    render(<AiToolsScreen />);

    for (const asset of ['forex', 'crypto', 'stocks']) {
      const pill = screen.getByTestId(`autopilot-asset-${asset}`);
      expect(pill.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('Upgrade to Pro navigates to the subscription screen', () => {
    render(<AiToolsScreen />);

    fireEvent.click(screen.getByTestId('autopilot-paywall-overlay-upgrade'));
    expect(routerPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/paywall',
        params: expect.objectContaining({ defaultTier: 'PRO' }),
      }),
    );
  });

  it('gates bot configuration behind the paywall — no mutation ships', () => {
    render(<AiToolsScreen />);

    fireEvent.click(screen.getByTestId('configure-bot-1'));
    const lastPaywallProps = paywallRenderSpy.mock.calls.at(-1)?.[0];
    expect(lastPaywallProps?.visible).toBe(true);
    // The config sheet never opens and no bot update is sent.
    expect(screen.queryByTestId('config-save')).toBeNull();
    expect(updateBotMutateMock).not.toHaveBeenCalled();
  });

  it('routes the Ask AI Oracle entry to the paywall for free users', () => {
    render(<AiToolsScreen />);

    fireEvent.click(screen.getByTestId('ask-oracle'));
    expect(routerPushMock).not.toHaveBeenCalledWith('/oracle');
    const lastPaywallProps = paywallRenderSpy.mock.calls.at(-1)?.[0];
    expect(lastPaywallProps?.visible).toBe(true);
  });
});

describe('AI Tools — pro user', () => {
  beforeEach(() => {
    subscriptionState.isSubscribed = true;
    subscriptionState.accessTier = 'pro';
  });

  it('renders no overlay and streams live data', () => {
    render(<AiToolsScreen />);

    expect(screen.queryByTestId('autopilot-paywall-overlay')).toBeNull();
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(screen.getByText('+$123.45')).toBeTruthy();
    expect(screen.getByText(/GRID Alpha: BUY setup filled/)).toBeTruthy();
  });

  it('keeps controls interactive and Ask AI Oracle navigates to the chat', () => {
    render(<AiToolsScreen />);

    const forex = screen.getByTestId('autopilot-asset-forex');
    expect(forex.getAttribute('aria-disabled')).not.toBe('true');

    fireEvent.click(screen.getByTestId('ask-oracle'));
    expect(routerPushMock).toHaveBeenCalledWith('/oracle');
  });
});

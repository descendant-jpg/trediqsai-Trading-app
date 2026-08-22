// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-blur', () => ({ BlurView: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/paywall', () => ({ ManageSubscriptionCard: () => null, ProWindDownBanner: () => null }));
vi.mock('@/components/PaywallModal', () => ({ PaywallModal: ({ visible }: { visible: boolean }) => visible ? <div data-testid="paywall-card" /> : null }));
vi.mock('@/components/AutoPilotSettingsModal', () => ({ AutoPilotSettingsModal: () => null }));
vi.mock('@/components/RiskDisclaimer', () => ({ RiskDisclaimer: () => null }));

const subscription = vi.hoisted(() => ({ accessTier: 'starter' as string | undefined, isAdmin: false }));
const customFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/revenuecat', () => ({ useSubscription: () => subscription }));
vi.mock('@workspace/api-client-react', () => ({ customFetch }));

const SIGNALS = [
  {
    id: 'sig-eth',
    pair: 'ETHUSD',
    assetClass: 'crypto',
    action: 'BUY',
    status: 'Won',
    riskReward: '1:3.8',
    entry: 3412.5,
    stopLoss: 3290,
    timestamp: Date.now(),
    pips: 3680,
  },
  {
    id: 'sig-btc',
    pair: 'BTCUSD',
    assetClass: 'crypto',
    action: 'SELL',
    status: 'Active',
    riskReward: '1:2.5',
    entry: 67100,
    stopLoss: 68200,
    timestamp: Date.now(),
    pips: -2300,
  },
];

import SignalsScreen from '../signals';

beforeEach(() => {
  subscription.accessTier = 'starter';
  subscription.isAdmin = false;
  customFetch.mockResolvedValue(SIGNALS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Signals paywall gating', () => {
  it('loads the live signal feed and shows its market summaries', async () => {
    render(<SignalsScreen />);

    await screen.findByText('ETHUSD');
    expect(screen.getByText('BUY · CRYPTO')).toBeTruthy();
    expect(screen.getByText('WON')).toBeTruthy();
    expect(screen.getByText('BTCUSD')).toBeTruthy();
    expect(customFetch).toHaveBeenCalledWith('/api/signals');
  });

  it('keeps starter signal values behind a Premium upgrade layer', async () => {
    render(<SignalsScreen />);

    await screen.findByText('ETHUSD');
    expect(screen.getAllByText('🔒 UNLOCK WITH PREMIUM').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('🔒 UNLOCK WITH PREMIUM')[0]);
    expect(screen.getByTestId('paywall-card')).toBeTruthy();
  });

  it('removes the lock layer for Pro and Elite subscribers', async () => {
    subscription.accessTier = 'pro';
    render(<SignalsScreen />);

    await screen.findByText('ETHUSD');
    expect(screen.queryByText('🔒 UNLOCK WITH PREMIUM')).toBeNull();
    expect(screen.getByText('ENTRY 3412.5')).toBeTruthy();
    expect(screen.getByText('SL 3290')).toBeTruthy();
  });

  it('filters the loaded feed by status', async () => {
    render(<SignalsScreen />);

    await screen.findByText('ETHUSD');
    fireEvent.click(screen.getByText('Active'));
    await waitFor(() => expect(screen.getByText('BTCUSD')).toBeTruthy());
    expect(screen.queryByText('ETHUSD')).toBeNull();
  });

  it('shows a retry state when the live feed cannot be reached', async () => {
    customFetch.mockRejectedValue(new Error('network unavailable'));
    render(<SignalsScreen />);

    await screen.findByText('Live signal feed unavailable');
    expect(screen.getByText('Tap to retry the secure connection.')).toBeTruthy();
  });
});
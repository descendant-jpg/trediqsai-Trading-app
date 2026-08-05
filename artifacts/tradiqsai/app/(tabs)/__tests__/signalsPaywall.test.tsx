// @vitest-environment jsdom
/**
 * Paywall gating tests for the AI Signals feed.
 *
 * Policy under test — for a NON-subscriber viewing a Pro signal (locked card):
 *   Visible:  symbol, name, PRO tag, BUY/SELL direction, timestamp.
 *   Hidden:   rationale (generic teaser instead), confidence %,
 *             WON/LOST outcome, Entry/TP/SL values (redacted to placeholders).
 * Free (non-pro) signals stay fully visible to everyone.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/paywall', () => ({
  ManageSubscriptionCard: () => null,
  PaywallCard: () => null,
  ProWindDownBanner: () => null,
}));

const subscription = vi.hoisted(() => ({
  isSubscribed: false,
  isLoading: false,
  verificationPending: false,
}));
vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscription,
}));

const PRO_SIGNAL = {
  id: 'sig-pro',
  symbol: 'ETHUSD',
  name: 'Ethereum',
  action: 'BUY',
  status: 'WON',
  pro: true,
  confidence: 91,
  time: '2h ago',
  rationale: 'Whale accumulation plus a bullish divergence on the 4h RSI.',
  price: '3,412.50',
  target: '3,650.00',
  stopLoss: '3,290.00',
};

const FREE_SIGNAL = {
  id: 'sig-free',
  symbol: 'BTCUSD',
  name: 'Bitcoin',
  action: 'SELL',
  status: 'LOST',
  pro: false,
  confidence: 74,
  time: '5h ago',
  rationale: 'Rejection at the weekly supply zone with fading volume.',
  price: '67,100.00',
  target: '64,800.00',
  stopLoss: '68,200.00',
};

vi.mock('@workspace/api-client-react', () => ({
  useGetSignals: () => ({
    data: [PRO_SIGNAL, FREE_SIGNAL],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import AISignalsScreen, { LOCKED_RATIONALE_TEASER } from '../signals';

beforeEach(() => {
  subscription.isSubscribed = false;
});

afterEach(() => {
  cleanup();
});

// ---- Tests ------------------------------------------------------------------

describe('Signals paywall gating (non-subscriber)', () => {
  it('locked Pro card shows only the allowed fields', () => {
    render(<AISignalsScreen />);

    // Allowed: symbol, name, direction, timestamp, PRO tag.
    expect(screen.getByText('ETHUSD')).toBeTruthy();
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText('2h ago')).toBeTruthy();
    expect(screen.getAllByText('PRO').length).toBeGreaterThan(0);
  });

  it('locked Pro card hides all premium insight fields', () => {
    render(<AISignalsScreen />);

    // Rationale is replaced with a generic teaser (not a truncation).
    expect(screen.queryByText(PRO_SIGNAL.rationale)).toBeNull();
    expect(screen.getByText(LOCKED_RATIONALE_TEASER)).toBeTruthy();

    // Confidence % is hidden.
    expect(screen.queryByText('91%')).toBeNull();
    expect(screen.getByText('Confidence locked')).toBeTruthy();

    // WON/LOST outcome is hidden (lock badge instead).
    expect(screen.queryByText('WON')).toBeNull();
    expect(screen.getByTestId('locked-status-sig-pro')).toBeTruthy();

    // Entry/TP/SL values never render — redacted, not just blurred.
    expect(screen.queryByText(PRO_SIGNAL.price)).toBeNull();
    expect(screen.queryByText(PRO_SIGNAL.target)).toBeNull();
    expect(screen.queryByText(PRO_SIGNAL.stopLoss)).toBeNull();
    expect(screen.getAllByText('•••').length).toBe(3);

    // Upgrade CTA is present; trade button is not.
    expect(screen.getByTestId('unlock-sig-pro')).toBeTruthy();
    expect(screen.queryByTestId('trade-signal-sig-pro')).toBeNull();
  });

  it('free (non-pro) card remains fully visible to non-subscribers', () => {
    render(<AISignalsScreen />);

    expect(screen.getByText(FREE_SIGNAL.rationale)).toBeTruthy();
    expect(screen.getByText('74%')).toBeTruthy();
    expect(screen.getByText('LOST')).toBeTruthy();
    expect(screen.getByText(FREE_SIGNAL.price)).toBeTruthy();
    expect(screen.getByText(FREE_SIGNAL.target)).toBeTruthy();
    expect(screen.getByText(FREE_SIGNAL.stopLoss)).toBeTruthy();
    expect(screen.getByTestId('trade-signal-sig-free')).toBeTruthy();
  });

  it('subscribers see full Pro signal content', () => {
    subscription.isSubscribed = true;
    render(<AISignalsScreen />);

    expect(screen.getByText(PRO_SIGNAL.rationale)).toBeTruthy();
    expect(screen.getByText('91%')).toBeTruthy();
    expect(screen.getByText('WON')).toBeTruthy();
    expect(screen.getByText(PRO_SIGNAL.price)).toBeTruthy();
    expect(screen.queryByText('•••')).toBeNull();
    expect(screen.getByTestId('trade-signal-sig-pro')).toBeTruthy();
  });
});

// @vitest-environment jsdom
/**
 * Paywall gating tests for the TradiQsAI Signal feed.
 *
 * Policy under test — for a NON-subscriber viewing a Premium signal (locked card):
 *   Visible:  asset, name, PRO tag, BUY/SELL direction, timeframe, timestamp.
 *   Hidden:   rationale (generic teaser instead), Won/SL Hit outcome,
 *             Entry/SL/TP values (redacted to placeholders).
 * Free (non-premium) signals stay fully visible to everyone.
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
  ProWindDownBanner: () => null,
}));

vi.mock('@/components/PaywallModal', () => ({
  PaywallModal: () => null,
}));

vi.mock('@/components/SignalDetailModal', () => ({
  default: () => null,
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
  asset: 'ETHUSD',
  name: 'Ethereum',
  direction: 'BUY',
  timeframe: 'H4',
  status: 'Won',
  rr: '1:3.8',
  confidence: '91%',
  risk: 'Medium',
  potentialPips: '+3680p',
  entry: { price: 3412.5 },
  stopLoss: { price: 3290, pips: 122, isBreakeven: false },
  takeProfits: [
    { id: 1, price: 3560, pips: 148, percentage: '40%', isHit: true },
    { id: 2, price: 3650, pips: 238, percentage: '35%', isHit: true },
    { id: 3, price: 3780, pips: 368, percentage: '25%', isHit: true },
  ],
  timeline: { created: '2026-08-04 10:00 UTC', closed: '2026-08-05 02:00 UTC' },
  isPremium: true,
  time: '2h ago',
  rationale: 'Whale accumulation plus a bullish divergence on the 4h RSI.',
};

const FREE_SIGNAL = {
  id: 'sig-free',
  asset: 'BTCUSD',
  name: 'Bitcoin',
  direction: 'SELL',
  timeframe: 'H1',
  status: 'SL Hit',
  rr: '1:2.5',
  confidence: '74%',
  risk: 'High',
  potentialPips: '+2300p',
  entry: { price: 67100 },
  stopLoss: { price: 68200, pips: 1100, isBreakeven: false },
  takeProfits: [
    { id: 1, price: 66000, pips: 1100, percentage: '50%', isHit: false },
    { id: 2, price: 65400, pips: 1700, percentage: '30%', isHit: false },
    { id: 3, price: 64800, pips: 2300, percentage: '20%', isHit: false },
  ],
  timeline: { created: '2026-08-04 09:00 UTC', closed: '2026-08-04 15:00 UTC' },
  isPremium: false,
  time: '5h ago',
  rationale: 'Rejection at the weekly supply zone with fading volume.',
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
  it('locked Premium card shows only the allowed fields', () => {
    render(<AISignalsScreen />);

    // Allowed: asset, name, direction, timestamp, PRO tag.
    expect(screen.getByText('ETHUSD')).toBeTruthy();
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText('2h ago')).toBeTruthy();
    expect(screen.getAllByText('PRO').length).toBeGreaterThan(0);
  });

  it('locked Premium card hides all premium insight fields', () => {
    render(<AISignalsScreen />);

    // Rationale is replaced with a generic teaser (not a truncation).
    expect(screen.queryByText(PRO_SIGNAL.rationale)).toBeNull();
    expect(screen.getByText(LOCKED_RATIONALE_TEASER)).toBeTruthy();

    // Won/SL Hit outcome is hidden (lock badge instead).
    expect(screen.queryByText('WON')).toBeNull();
    expect(screen.getByTestId('locked-status-sig-pro')).toBeTruthy();

    // Entry/SL/TP values never render — redacted, not just blurred.
    expect(screen.queryByText(String(PRO_SIGNAL.entry.price))).toBeNull();
    expect(screen.queryByText(String(PRO_SIGNAL.stopLoss.price))).toBeNull();
    for (const tp of PRO_SIGNAL.takeProfits) {
      expect(screen.queryByText(String(tp.price))).toBeNull();
    }
    // 3 grid placeholders + 2 secondary target placeholders + 2 pip pills.
    expect(screen.getAllByText('•••').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('Targets locked')).toBeTruthy();

    // Upgrade CTA is present; trade/action row is not.
    expect(screen.getByTestId('unlock-sig-pro')).toBeTruthy();
    expect(screen.queryByTestId('trade-signal-sig-pro')).toBeNull();
    expect(screen.queryByTestId('details-sig-pro')).toBeNull();
  });

  it('free (non-premium) card remains fully visible to non-subscribers', () => {
    render(<AISignalsScreen />);

    expect(screen.getByText(FREE_SIGNAL.rationale)).toBeTruthy();
    expect(screen.getByText('SL HIT')).toBeTruthy();
    expect(screen.getByText(String(FREE_SIGNAL.entry.price))).toBeTruthy();
    expect(screen.getByText(String(FREE_SIGNAL.stopLoss.price))).toBeTruthy();
    expect(screen.getByTestId('trade-signal-sig-free')).toBeTruthy();
    expect(screen.getByTestId('details-sig-free')).toBeTruthy();
  });

  it('subscribers see full Premium signal content', () => {
    subscription.isSubscribed = true;
    render(<AISignalsScreen />);

    expect(screen.getByText(PRO_SIGNAL.rationale)).toBeTruthy();
    expect(screen.getByText('WON')).toBeTruthy();
    expect(screen.getByText(String(PRO_SIGNAL.entry.price))).toBeTruthy();
    expect(screen.queryByText('•••')).toBeNull();
    expect(screen.getByTestId('trade-signal-sig-pro')).toBeTruthy();
  });

  it('shows the trial banner to non-subscribers with an upgrade button', () => {
    render(<AISignalsScreen />);
    expect(screen.getByTestId('trial-banner')).toBeTruthy();
    expect(screen.getByText('10 of 10 trial signals remaining')).toBeTruthy();
    expect(screen.getByTestId('trial-upgrade')).toBeTruthy();
  });

  it('hides the trial banner for subscribers', () => {
    subscription.isSubscribed = true;
    render(<AISignalsScreen />);
    expect(screen.queryByTestId('trial-banner')).toBeNull();
  });
});

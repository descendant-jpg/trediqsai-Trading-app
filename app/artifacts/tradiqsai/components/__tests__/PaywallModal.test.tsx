// @vitest-environment jsdom
/**
 * PaywallModal — full-screen upgrade paywall.
 *
 * Covers: billing-cycle package selection (MONTHLY vs ANNUAL), the real
 * purchase path, restore, the legal doc modal, and state reset on
 * close/reopen. Rendered with react-native-web in jsdom; closed RNW Modals
 * render nothing, so reopen assertions use a rerender with visible=true.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PaywallModal } from '../PaywallModal';

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native-web');
  return { SafeAreaView: View };
});

const monthlyPackage = {
  identifier: '$rc_monthly',
  packageType: 'MONTHLY',
  product: { priceString: '$29.99', identifier: 'pro_monthly', title: 'Pro Monthly' },
};
const annualPackage = {
  identifier: '$rc_annual',
  packageType: 'ANNUAL',
  product: { priceString: '$309.99', identifier: 'pro_annual', title: 'Pro Annual' },
};

const subscription = vi.hoisted(() => ({
  offerings: undefined as any,
  isPurchasing: false,
  isRestoring: false,
  // Mirrors RevenueCat: purchasePackage resolves with fresh CustomerInfo
  // carrying the active entitlement.
  purchase: vi.fn(async () => ({ entitlements: { active: { pro: {} } } })),
  restore: vi.fn(async () => ({})),
  refreshProfileEntitlement: vi.fn(async () => ({})),
}));

vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscription,
  REVENUECAT_ENTITLEMENT_IDENTIFIER: 'pro',
  REVENUECAT_ELITE_ENTITLEMENT_IDENTIFIER: 'elite',
}));

function press(testID: string) {
  fireEvent.click(screen.getByTestId(testID));
}

describe('PaywallModal', () => {
  beforeEach(() => {
    subscription.offerings = {
      current: { availablePackages: [monthlyPackage, annualPackage] },
    };
    subscription.purchase = vi.fn(async () => ({ entitlements: { active: { pro: {} } } }));
    subscription.restore = vi.fn(async () => ({}));
    subscription.refreshProfileEntitlement = vi.fn(async () => ({}));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('purchases the annual package by default and closes on success', async () => {
    const onClose = vi.fn();
    render(<PaywallModal visible onClose={onClose} />);
    expect(screen.getByText('Continue to Checkout')).toBeTruthy();
    expect(screen.getAllByText('$309.99/year').length).toBeGreaterThan(0);

    press('paywall-cta');
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(subscription.purchase).toHaveBeenCalledWith(annualPackage);
    expect(subscription.refreshProfileEntitlement).toHaveBeenCalled();
  });

  it('purchases the monthly package when Monthly is selected', async () => {
    const onClose = vi.fn();
    render(<PaywallModal visible onClose={onClose} />);
    press('billing-monthly');
    expect(screen.getAllByText('$29.99/month').length).toBeGreaterThan(0);

    press('paywall-cta');
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(subscription.purchase).toHaveBeenCalledWith(monthlyPackage);
  });

  it('stays open silently when the user cancels in the store sheet', async () => {
    subscription.purchase = vi.fn(async () => {
      throw Object.assign(new Error('cancelled'), { userCancelled: true });
    });
    const onClose = vi.fn();
    render(<PaywallModal visible onClose={onClose} />);
    press('paywall-cta');
    await vi.waitFor(() => expect(subscription.purchase).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('runs restore from the legal footer', async () => {
    render(<PaywallModal visible onClose={() => {}} />);
    press('paywall-restore');
    await vi.waitFor(() => expect(subscription.restore).toHaveBeenCalled());
    expect(subscription.refreshProfileEntitlement).toHaveBeenCalled();
  });

  it('opens the Terms and Privacy documents', () => {
    render(<PaywallModal visible onClose={() => {}} />);
    fireEvent.click(screen.getByText('Terms of Use (EULA)'));
    expect(screen.getByText(/auto-renewing subscription/)).toBeTruthy();
  });

  it('resets to the annual cycle after close and reopen', () => {
    const { rerender } = render(<PaywallModal visible onClose={() => {}} />);
    press('billing-monthly');
    expect(screen.getAllByText('$29.99/month').length).toBeGreaterThan(0);

    rerender(<PaywallModal visible={false} onClose={() => {}} />);
    rerender(<PaywallModal visible onClose={() => {}} />);
    expect(screen.getAllByText('$309.99/year').length).toBeGreaterThan(0);
  });

  it('falls back to spec prices when offerings are unavailable', () => {
    subscription.offerings = undefined;
    render(<PaywallModal visible onClose={() => {}} />);
    expect(screen.getByText('$29.99/mo')).toBeTruthy();
    expect(screen.getByText('$309.99/yr')).toBeTruthy();
  });
});

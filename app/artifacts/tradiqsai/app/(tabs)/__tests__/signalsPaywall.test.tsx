// @vitest-environment jsdom
/**
 * Signal Desk — multi-asset list, quota banner, and free-tier gating.
 * The server owns quota accounting; these tests pin the client contract.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: routerPush, back: vi.fn() }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-blur', () => ({ BlurView: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('@/components/PaywallModal', () => ({
  PaywallModal: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="paywall-card" /> : null),
}));
vi.mock('@/components/AutoPilotSettingsModal', () => ({ AutoPilotSettingsModal: () => null }));
vi.mock('@/components/RiskDisclaimer', () => ({ RiskDisclaimer: () => null }));

const subscription = vi.hoisted(() => ({ accessTier: 'starter' as string | undefined, isAdmin: false }));
const customFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/revenuecat', () => ({ useSubscription: () => subscription }));
vi.mock('@workspace/api-client-react', () => ({ customFetch }));

const OPEN_SIGNAL = {
  id: 'sig-gold',
  pair: 'XAU/USD',
  assetClass: 'forex',
  action: 'BUY',
  status: 'Active',
  riskReward: '1:3.2',
  entry: 2460.5,
  stopLoss: 2452.5,
  takeProfits: [
    { id: 1, price: 2468.5, pips: 80, label: '+80p', isHit: true, hitAt: '2026-08-25T09:00:00Z' },
    { id: 2, price: 2476.5, pips: 160, label: '+160p', isHit: false, hitAt: null },
    { id: 3, price: 2486.1, pips: 256, label: '+256p', isHit: false, hitAt: null },
  ],
  timestamp: Date.parse('2026-08-25T08:30:00Z'),
  pips: 80,
  analysis: 'Gold holds the pivot.',
  confidence: 78,
  risk: 'Low',
  timeframe: 'H1',
  breakeven: true,
  openedAt: Date.parse('2026-08-25T08:35:00Z'),
  closedAt: null,
  locked: false,
};

const LOCKED_SIGNAL = {
  ...OPEN_SIGNAL,
  id: 'sig-btc',
  pair: 'BTC/USD',
  assetClass: 'crypto',
  action: 'SELL',
  entry: 'LOCKED',
  stopLoss: 'LOCKED',
  takeProfits: [],
  pips: 'LOCKED',
  analysis: null,
  confidence: null,
  locked: true,
};

const AAPL_SIGNAL = {
  ...OPEN_SIGNAL,
  id: 'sig-aapl',
  pair: 'AAPL',
  assetClass: 'stocks',
  takeProfits: [
    { id: 1, price: 232.5, pips: 250, label: '+$2.50', isHit: false, hitAt: null },
    { id: 2, price: 235, pips: 500, label: '+$5.00', isHit: false, hitAt: null },
    { id: 3, price: 238, pips: 800, label: '+$8.00', isHit: false, hitAt: null },
  ],
};

function feed(signals: unknown[], quota = { premium: false, limit: 5, used: 2, remaining: 3 }) {
  return { signals, quota };
}

import SignalsScreen from '../signals';

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  subscription.accessTier = 'starter';
  subscription.isAdmin = false;
  customFetch.mockResolvedValue(feed([OPEN_SIGNAL, LOCKED_SIGNAL, AAPL_SIGNAL]));
});

describe('Signal Desk', () => {
  it('renders the quota banner with remaining count for free users', async () => {
    render(<SignalsScreen />);
    const banner = await screen.findByTestId('quota-banner');
    expect(banner.textContent).toContain('3 of 5 free signals remaining today');
    expect(banner.textContent).toContain('Upgrade for unlimited signals');
  });

  it('routes the glowing Upgrade CTA to /paywall', async () => {
    render(<SignalsScreen />);
    fireEvent.click(await screen.findByTestId('quota-upgrade'));
    expect(routerPush).toHaveBeenCalledWith('/paywall');
  });

  it('hides the quota banner for premium users', async () => {
    customFetch.mockResolvedValue(feed([OPEN_SIGNAL], { premium: true, limit: 5, used: 0, remaining: 5 }));
    render(<SignalsScreen />);
    await screen.findByTestId(`signal-card-${OPEN_SIGNAL.id}`);
    expect(screen.queryByTestId('quota-banner')).toBeNull();
  });

  it('filters cards by asset category', async () => {
    render(<SignalsScreen />);
    await screen.findByTestId('signal-card-sig-gold');
    expect(screen.getByTestId('signal-card-sig-btc')).toBeTruthy();
    expect(screen.getByTestId('signal-card-sig-aapl')).toBeTruthy();

    fireEvent.click(screen.getByTestId('category-crypto'));
    expect(screen.queryByTestId('signal-card-sig-gold')).toBeNull();
    expect(screen.getByTestId('signal-card-sig-btc')).toBeTruthy();
    expect(screen.queryByTestId('signal-card-sig-aapl')).toBeNull();
  });

  it('shows entry, break-even stop, and TP checkpoints with per-asset labels', async () => {
    render(<SignalsScreen />);
    const card = await screen.findByTestId('signal-card-sig-gold');
    expect(card.textContent).toContain('2460.50');
    expect(card.textContent).toContain('STOP LOSS · BE');
    expect(card.textContent).toContain('TP1 +80p');
    expect(card.textContent).toContain('TP3 +256p');
    const stock = screen.getByTestId('signal-card-sig-aapl');
    expect(stock.textContent).toContain('TP1 +$2.50');
  });

  it('gates locked signals behind the unlock action', async () => {
    render(<SignalsScreen />);
    const locked = await screen.findByTestId('signal-card-sig-btc');
    expect(locked.textContent).toContain('TP1 ••••');
    expect(locked.textContent).not.toContain('67100');
    expect(screen.getByTestId('unlock-sig-btc')).toBeTruthy();
  });

  it('unlocks a signal via the server and opens its detail view', async () => {
    const unlocked = { ...LOCKED_SIGNAL, locked: false, entry: 67100, takeProfits: OPEN_SIGNAL.takeProfits };
    customFetch.mockImplementation((url: string) => {
      if (url === '/api/signals') return Promise.resolve(feed([OPEN_SIGNAL, LOCKED_SIGNAL]));
      if (url === '/api/signals/sig-btc/unlock') {
        return Promise.resolve({ signal: unlocked, quota: { premium: false, limit: 5, used: 1, remaining: 4 } });
      }
      return Promise.reject(new Error('unknown url'));
    });
    render(<SignalsScreen />);

    fireEvent.click(await screen.findByTestId('unlock-sig-btc'));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith({ pathname: '/signals/[id]', params: { id: 'sig-btc' } }),
    );
    expect(customFetch).toHaveBeenCalledWith(
      '/api/signals/sig-btc/unlock',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('opens the paywall when the server refuses the unlock (quota exhausted)', async () => {
    customFetch.mockImplementation((url: string) => {
      if (url === '/api/signals') return Promise.resolve(feed([LOCKED_SIGNAL]));
      return Promise.reject(new Error('402: Daily free signal limit reached. Upgrade for unlimited signals.'));
    });
    render(<SignalsScreen />);

    fireEvent.click(await screen.findByTestId('unlock-sig-btc'));

    await waitFor(() => expect(screen.getByTestId('paywall-card')).toBeTruthy());
    expect(routerPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/signals/[id]' }),
    );
  });

  it('navigates to the institutional detail screen from an unlocked card', async () => {
    render(<SignalsScreen />);
    fireEvent.click(await screen.findByTestId('details-sig-gold'));
    expect(routerPush).toHaveBeenCalledWith({ pathname: '/signals/[id]', params: { id: 'sig-gold' } });
  });
});

// @vitest-environment jsdom
/**
 * Institutional Signal Details — stats bar, price map, TP checkpoints,
 * collapsible AI analysis, timeline, locked (402) path, share action.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerBack = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: routerBack, push: vi.fn() }),
  useLocalSearchParams: () => ({ id: 'sig-gold' }),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('@/components/PaywallModal', () => ({
  PaywallModal: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="paywall-card" /> : null),
}));

const customFetch = vi.hoisted(() => vi.fn());
vi.mock('@workspace/api-client-react', () => ({ customFetch }));

const SIGNAL = {
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
  analysis: 'Gold holds the 2460 pivot with H1 momentum aligned. Targets scale out at three checkpoints.',
  confidence: 78,
  risk: 'Low',
  timeframe: 'H1',
  breakeven: true,
  openedAt: Date.parse('2026-08-25T08:35:00Z'),
  closedAt: null,
  locked: false,
};

import SignalDetailScreen from '../[id]';

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  customFetch.mockResolvedValue(SIGNAL);
});

describe('Signal Details', () => {
  it('renders the top stats bar with R:R, confidence, risk and potential', async () => {
    render(<SignalDetailScreen />);
    const stats = await screen.findByTestId('detail-stats');
    expect(stats.textContent).toContain('1:3.2');
    expect(stats.textContent).toContain('78%');
    expect(stats.textContent).toContain('Low');
    expect(stats.textContent).toContain('+256p');
  });

  it('renders the price map with SL, entry and TP checkpoints', async () => {
    render(<SignalDetailScreen />);
    const map = await screen.findByTestId('price-map');
    for (const label of ['SL', 'ENTRY', 'TP1', 'TP2', 'TP3']) {
      expect(map.textContent).toContain(label);
    }
    expect(map.textContent).toContain('BREAK-EVEN');
  });

  it('lists TP checkpoints with hit status and prices', async () => {
    render(<SignalDetailScreen />);
    const list = await screen.findByTestId('tp-checkpoints');
    expect(list.textContent).toContain('+80p');
    expect(list.textContent).toContain('2468.50');
    expect(list.textContent).toContain('Hit');
    expect(list.textContent).toContain('Awaiting target');
    expect(list.textContent).toContain('1/3 targets hit');
  });

  it('keeps the AI analysis collapsed until toggled', async () => {
    render(<SignalDetailScreen />);
    await screen.findByTestId('detail-stats');
    expect(screen.queryByTestId('analysis-body')).toBeNull();

    fireEvent.click(screen.getByTestId('analysis-toggle'));
    expect(screen.getByTestId('analysis-body').textContent).toContain('2460 pivot');

    fireEvent.click(screen.getByTestId('analysis-toggle'));
    expect(screen.queryByTestId('analysis-body')).toBeNull();
  });

  it('renders the trade timeline with created and trigger timestamps', async () => {
    render(<SignalDetailScreen />);
    const timeline = await screen.findByTestId('timeline');
    expect(timeline.textContent).toContain('Signal created');
    expect(timeline.textContent).toContain('Entry triggered');
    expect(timeline.textContent).toContain('Aug 25');
  });

  it('shows the branded share action', async () => {
    render(<SignalDetailScreen />);
    expect(await screen.findByTestId('share-signal')).toBeTruthy();
  });

  it('renders the locked state with an upgrade CTA on 402', async () => {
    customFetch.mockRejectedValue(new Error('402: locked'));
    render(<SignalDetailScreen />);
    expect((await screen.findByTestId('detail-upgrade')).textContent).toContain('UPGRADE');
    fireEvent.click(screen.getByTestId('detail-upgrade'));
    expect(screen.getByTestId('paywall-card')).toBeTruthy();
  });

  it('fetches the signal by route id', async () => {
    render(<SignalDetailScreen />);
    await waitFor(() => expect(customFetch).toHaveBeenCalledWith('/api/signals/sig-gold'));
  });
});

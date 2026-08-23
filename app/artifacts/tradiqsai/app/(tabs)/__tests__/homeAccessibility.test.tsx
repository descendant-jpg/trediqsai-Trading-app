// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('expo-haptics', () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Error: 'error', Warning: 'warning', Success: 'success' },
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn() }),
  useFocusEffect: vi.fn(),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null, refresh: vi.fn() }) }));
vi.mock('@/hooks/useLiveMarket', () => ({
  useLiveMarket: () => ({ livePrice: 0, chartData: [], heartbeat: 0, connected: true }),
}));
vi.mock('@/services/TradeService', () => ({
  openTrade: vi.fn(),
  closeTrade: vi.fn(),
}));
vi.mock('@/context/TradingContext', () => ({
  useTrading: () => ({
    price: 100,
    equity: 100000,
    position: null,
    unrealizedPnl: 0,
    drawdownUsed: 0,
    distanceToPayout: 5000,
    buy: vi.fn(),
    sell: vi.fn(),
  }),
}));
vi.mock('@/components/trading', () => ({
  TerminalHeader: () => null,
  BalanceCard: () => null,
  DrawdownBar: () => null,
  PositionCard: () => null,
  BlownAccountCard: () => null,
  ExecutionButtons: () => null,
}));
vi.mock('@/components/wagmi-chart', () => ({ TradingChart: () => null }));
vi.mock('@/components/live-ticker', () => ({ LivePriceTicker: () => null }));
vi.mock('@/components/paywall', () => ({ ProWindDownBanner: () => null }));
vi.mock('@/components/PaywallModal', () => ({ PaywallModal: () => null }));

import HomeScreen from '../index';

afterEach(() => cleanup());

describe('Home dashboard accessibility', () => {
  it('exposes accessible names for dashboard actions and announcements', () => {
    render(<HomeScreen />);

    expect(screen.getByRole('button', { name: 'Market quotes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sydney market session' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Competition' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trade Journal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Pro. Trade with more edge.' })).toBeTruthy();
    expect(screen.getByLabelText('Fear and Greed index: 68, Greed. Local sample indicator.')).toBeTruthy();
  });
});
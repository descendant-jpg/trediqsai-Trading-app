// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn(), push: mocks.push }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@workspace/api-client-react', () => ({ customFetch: mocks.customFetch }));

import NotificationsScreen from '../notifications';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Notifications live alerts', () => {
  it('loads live alerts and filters them by asset class', async () => {
    mocks.customFetch.mockResolvedValue([
      {
        id: 'crypto-alert',
        title: 'Bitcoin setup ready',
        message: 'Watch confirmation before adding risk.',
        type: 'AI_ALERT',
        assetClass: 'crypto',
        timestamp: Date.now(),
        referenceId: 'btc-1',
      },
      {
        id: 'forex-alert',
        title: 'EUR/USD setup ready',
        message: 'Momentum is building.',
        type: 'AI_ALERT',
        assetClass: 'forex',
        timestamp: Date.now(),
        referenceId: 'eur-1',
      },
    ]);
    render(<NotificationsScreen />);

    await screen.findByText('Bitcoin setup ready');
    fireEvent.click(screen.getByRole('button', { name: 'Filter Crypto' }));
    expect(screen.getByText('Bitcoin setup ready')).toBeTruthy();
    expect(screen.queryByText('EUR/USD setup ready')).toBeNull();
  });

  it('keeps retry feedback usable when loading live alerts fails', async () => {
    mocks.customFetch.mockRejectedValue(new Error('network unavailable'));
    render(<NotificationsScreen />);

    await screen.findByText(/Live alerts are temporarily unavailable/);
  });
});
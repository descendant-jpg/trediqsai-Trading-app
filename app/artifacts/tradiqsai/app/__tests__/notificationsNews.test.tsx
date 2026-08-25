// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchMarketNews: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), dismiss: vi.fn(), navigate: vi.fn() }),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@/services/supabaseService', () => ({ fetchMarketNews: mocks.fetchMarketNews }));
// The reader modal pulls in react-native-webview, which jsdom cannot transform.
vi.mock('@/components/NewsDetailModal', () => ({ NewsDetailModal: () => null }));
vi.mock('react-native-webview', () => ({ WebView: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import NotificationsScreen from '../notifications';

const article = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  external_id: 'fh-1',
  headline: 'Bitcoin breaks resistance',
  ai_summary: 'Momentum is building as volume expands.',
  category: 'crypto',
  sentiment: 'Bullish',
  url: 'https://example.com/1',
  published_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Notifications market wire', () => {
  it('loads the live news feed and filters it by asset class', async () => {
    mocks.fetchMarketNews.mockResolvedValue([
      article(),
      article({
        id: 2,
        external_id: 'fh-2',
        headline: 'EUR/USD momentum builds',
        category: 'forex',
        sentiment: 'Neutral',
        url: 'https://example.com/2',
      }),
    ]);
    render(<NotificationsScreen />);

    await screen.findByText('Bitcoin breaks resistance');
    fireEvent.click(screen.getByRole('button', { name: 'Filter Forex' }));
    expect(screen.queryByText('Bitcoin breaks resistance')).toBeNull();
    expect(screen.getByText('EUR/USD momentum builds')).toBeTruthy();
  });

  it('opens the reader and marks the story as read on tap', async () => {
    mocks.fetchMarketNews.mockResolvedValue([article()]);
    render(<NotificationsScreen />);

    await screen.findByText('1 unread market updates');
    fireEvent.click(screen.getByRole('button', { name: 'Read: Bitcoin breaks resistance' }));
    await screen.findByText('All caught up');
  });

  it('keeps retry feedback usable when the wire fails', async () => {
    mocks.fetchMarketNews.mockRejectedValue(new Error('network unavailable'));
    render(<NotificationsScreen />);

    await screen.findByText(/market wire is temporarily unavailable/);
  });
});

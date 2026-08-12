// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchMarketNews: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn(), push: mocks.push }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@/services/supabaseService', () => ({ fetchMarketNews: mocks.fetchMarketNews }));
vi.mock('@/components/NewsDetailModal', () => ({
  NewsDetailModal: ({ article }: { article: { headline: string } | null }) =>
    article ? <div data-testid="news-detail">{article.headline}</div> : null,
}));

import NotificationsScreen from '../notifications';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Notifications market news', () => {
  it('loads cached Supabase stories in the News filter and opens details in-app', async () => {
    mocks.fetchMarketNews.mockResolvedValue([
      {
        id: 42,
        external_id: 'article-42',
        headline: 'Bitcoin volatility lifts into the session',
        ai_summary: 'Liquidity is improving. Traders should watch confirmation before adding risk.',
        category: 'crypto',
        sentiment: 'Bullish',
        url: 'https://example.com/article',
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    render(<NotificationsScreen />);

    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Filter News' }));
    expect(screen.getByText('Bitcoin volatility lifts into the session')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Bitcoin volatility lifts/i }));
    expect(screen.getByTestId('news-detail').textContent).toContain('Bitcoin volatility lifts into the session');
  });

  it('keeps the News filter usable when the cache read is unavailable', async () => {
    mocks.fetchMarketNews.mockRejectedValue(new Error('network unavailable'));
    render(<NotificationsScreen />);

    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Filter News' }));
    expect(screen.getByText('Market news is temporarily unavailable.')).toBeTruthy();
  });
});
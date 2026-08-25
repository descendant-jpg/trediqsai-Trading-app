// @vitest-environment jsdom
/**
 * AutoPilot command center — hierarchical paywall + premium dashboard.
 *
 * The screen is wrapped in ProPaywallOverlay for free users; ADMIN/ELITE/PRO
 * pass through the shared cascade (canAccessTool). The API layer is faked
 * in-memory so deploy/toggle flows are exercised end-to-end.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptionState = vi.hoisted(() => ({
  current: { isSubscribed: true, isAdmin: false, accessTier: 'pro' as string },
}));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

const haptics = vi.hoisted(() => ({ impactAsync: vi.fn() }));
vi.mock('expo-haptics', () => ({
  impactAsync: haptics.impactAsync,
  ImpactFeedbackStyle: { Light: 'light' },
}));

vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));

vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscriptionState.current,
}));

vi.mock('@/components/ProPaywallOverlay', () => ({
  ProPaywallOverlay: ({ message, testID }: { message?: string; testID?: string }) => (
    <View testID={testID ?? 'pro-paywall-overlay'} accessibilityLabel={message} />
  ),
}));

const customFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@workspace/api-client-react', () => ({
  customFetch: customFetchMock,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import AutoPilotScreen from '../autopilot';

type Bot = {
  id: string;
  pair: string;
  strategy: 'GRID' | 'DCA';
  capital: number;
  status: 'active' | 'paused';
  pnl: number;
  created_at: string;
};

let bots: Bot[];
let deployCounter: number;

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  subscriptionState.current = { isSubscribed: true, isAdmin: false, accessTier: 'pro' };
  bots = [
    { id: 'bot-1', pair: 'BTC/USD', strategy: 'DCA', capital: 10000, status: 'active', pnl: 500, created_at: 't' },
    { id: 'bot-2', pair: 'EUR/USD', strategy: 'GRID', capital: 4000, status: 'paused', pnl: -100, created_at: 't' },
  ];
  deployCounter = 0;
  customFetchMock.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (path === '/api/bots' && !init) return bots;
    if (path === '/api/bots' && init?.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}');
      const bot: Bot = {
        id: `bot-new-${++deployCounter}`,
        status: 'active',
        pnl: 0,
        created_at: 't',
        ...body,
      };
      bots = [...bots, bot];
      return bot;
    }
    const statusMatch = path.match(/^\/api\/bots\/(.+)\/status$/);
    if (statusMatch && init?.method === 'PATCH') {
      const body = JSON.parse(init.body ?? '{}');
      bots = bots.map((b) => (b.id === statusMatch[1] ? { ...b, status: body.status } : b));
      return bots.find((b) => b.id === statusMatch[1]);
    }
    throw new Error(`Unexpected request: ${path}`);
  });
});

async function renderScreen() {
  render(<AutoPilotScreen />);
  await screen.findByTestId('bot-card-bot-1');
}

describe('AutoPilot — paywall gate', () => {
  it('covers the dashboard with the paywall overlay for free users', async () => {
    subscriptionState.current = { isSubscribed: false, isAdmin: false, accessTier: 'starter' };
    await renderScreen();

    expect(screen.getByTestId('autopilot-paywall-overlay')).toBeTruthy();
    // The dashboard still renders behind the curtain as a blurred tease.
    expect(screen.getByTestId('metric-active-capital')).toBeTruthy();
    expect(screen.getByTestId('template-fx-news-scalper')).toBeTruthy();
  });

  it('admins bypass the paywall regardless of store tier', async () => {
    subscriptionState.current = { isSubscribed: false, isAdmin: true, accessTier: 'starter' };
    await renderScreen();

    expect(screen.queryByTestId('autopilot-paywall-overlay')).toBeNull();
    expect(screen.getByTestId('metric-total-roi')).toBeTruthy();
  });

  it('elite users inherit Pro access to the dashboard', async () => {
    subscriptionState.current = { isSubscribed: true, isAdmin: false, accessTier: 'elite' };
    await renderScreen();

    expect(screen.queryByTestId('autopilot-paywall-overlay')).toBeNull();
  });

  it('never mounts the deploy sheet for free users, even when the CTA is reached', async () => {
    subscriptionState.current = { isSubscribed: false, isAdmin: false, accessTier: 'starter' };
    await renderScreen();

    // The mocked overlay does not block presses, so this exercises the
    // component's own entitlement gate rather than the curtain.
    fireEvent.click(screen.getByTestId('deploy-custom-button'));
    fireEvent.click(screen.getByTestId('template-fx-news-scalper'));

    expect(screen.queryByTestId('deploy-modal')).toBeNull();
    expect(customFetchMock).not.toHaveBeenCalledWith(
      '/api/bots',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('AutoPilot — premium dashboard', () => {
  it('computes Active Capital, Total ROI and 24H Win Rate from live bots', async () => {
    await renderScreen();

    // Active capital counts only running bots: 10,000 of 14,000 deployed.
    expect(screen.getByTestId('metric-active-capital').textContent).toContain('$10,000');
    // ROI across all deployed capital: (500 - 100) / 14,000 = +2.86%.
    expect(screen.getByTestId('metric-total-roi').textContent).toContain('+2.86%');
    // The single active bot is profitable.
    expect(screen.getByTestId('metric-win-rate').textContent).toContain('100%');
  });

  it('renders the three multi-asset templates', async () => {
    await renderScreen();

    expect(screen.getByTestId('template-fx-news-scalper').textContent).toContain('FX News Scalper');
    expect(screen.getByTestId('template-fx-news-scalper').textContent).toContain('EUR/USD');
    expect(screen.getByTestId('template-dynamic-dca').textContent).toContain('Dynamic DCA Engine');
    expect(screen.getByTestId('template-dynamic-dca').textContent).toContain('BTC/USD');
    expect(screen.getByTestId('template-vol-swing').textContent).toContain('Volatility Swing');
    expect(screen.getByTestId('template-vol-swing').textContent).toContain('NVDA');
  });

  it('tapping a template pre-fills the deploy sheet and deploys the bot', async () => {
    await renderScreen();

    fireEvent.click(screen.getByTestId('template-vol-swing'));
    expect(screen.getByTestId('deploy-modal')).toBeTruthy();
    expect(haptics.impactAsync).toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('capital-input'), { target: { value: '7500' } });
    fireEvent.click(screen.getByTestId('deploy-submit'));

    await waitFor(() => expect(screen.getByTestId('bot-card-bot-new-1')).toBeTruthy());
    expect(customFetchMock).toHaveBeenCalledWith(
      '/api/bots',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pair: 'NVDA', strategy: 'GRID', capital: 7500 }),
      }),
    );
  });

  it('Deploy Custom Bot opens the sheet with default selections', async () => {
    await renderScreen();

    fireEvent.click(screen.getByTestId('deploy-custom-button'));
    expect(screen.getByTestId('deploy-modal')).toBeTruthy();

    fireEvent.change(screen.getByTestId('capital-input'), { target: { value: '2500' } });
    fireEvent.click(screen.getByTestId('deploy-submit'));

    await waitFor(() => expect(screen.getByTestId('bot-card-bot-new-1')).toBeTruthy());
    expect(customFetchMock).toHaveBeenCalledWith(
      '/api/bots',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pair: 'BTC/USD', strategy: 'GRID', capital: 2500 }),
      }),
    );
  });

  it('toggling a bot pauses it and flips the status badge', async () => {
    await renderScreen();

    expect(screen.getByTestId('bot-status-bot-1').textContent).toContain('RUNNING');
    // RNW Switch renders a hidden checkbox input — click it, not the wrapper.
    const switchInput = within(screen.getByTestId('bot-toggle-bot-1')).getByRole('switch');
    fireEvent.click(switchInput);

    await waitFor(() =>
      expect(screen.getByTestId('bot-status-bot-1').textContent).toContain('PAUSED'),
    );
    expect(customFetchMock).toHaveBeenCalledWith(
      '/api/bots/bot-1/status',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'paused' }) }),
    );
    expect(haptics.impactAsync).toHaveBeenCalled();
  });

  it('shows the empty state when no bots are deployed', async () => {
    bots = [];
    render(<AutoPilotScreen />);

    const empty = await screen.findByTestId('my-bots-empty');
    expect(empty.textContent).toContain('No bots deployed yet');
  });

  it('renders live P&L with gain/loss coloring on bot cards', async () => {
    await renderScreen();

    expect(screen.getByTestId('bot-card-bot-1').textContent).toContain('+$500.00');
    expect(screen.getByTestId('bot-card-bot-2').textContent).toContain('$-100.00');
  });

  it('shows deploy failures inside the sheet, not beneath it', async () => {
    customFetchMock.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/bots' && !init) return bots;
      if (path === '/api/bots' && init?.method === 'POST') throw new Error('boom');
      throw new Error(`Unexpected request: ${path}`);
    });
    await renderScreen();

    fireEvent.click(screen.getByTestId('deploy-custom-button'));
    fireEvent.change(screen.getByTestId('capital-input'), { target: { value: '2500' } });
    fireEvent.click(screen.getByTestId('deploy-submit'));

    const deployError = await screen.findByTestId('deploy-error');
    expect(deployError.textContent).toContain('Unable to deploy bot');
    // The sheet stays open so the user can fix and retry.
    expect(screen.getByTestId('deploy-modal')).toBeTruthy();
  });

  it('rejects invalid capital with an in-sheet validation message', async () => {
    await renderScreen();

    fireEvent.click(screen.getByTestId('deploy-custom-button'));
    fireEvent.change(screen.getByTestId('capital-input'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('deploy-submit'));

    const deployError = await screen.findByTestId('deploy-error');
    expect(deployError.textContent).toContain('valid virtual capital');
    expect(customFetchMock).not.toHaveBeenCalledWith(
      '/api/bots',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps metrics finite when the API returns malformed numbers', async () => {
    bots = [
      { id: 'bot-x', pair: 'BTC/USD', strategy: 'GRID', capital: Number('junk'), status: 'active', pnl: Number('junk'), created_at: 't' },
    ];
    render(<AutoPilotScreen />);

    const capital = await screen.findByTestId('metric-active-capital');
    expect(capital.textContent).not.toContain('NaN');
    expect(screen.getByTestId('metric-total-roi').textContent).not.toContain('NaN');
    expect(screen.getByTestId('metric-win-rate').textContent).not.toContain('NaN');
    expect(screen.getByTestId('bot-card-bot-x').textContent).not.toContain('NaN');
  });
});

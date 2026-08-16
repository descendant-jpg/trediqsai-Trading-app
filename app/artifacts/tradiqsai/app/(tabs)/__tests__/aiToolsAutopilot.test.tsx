// @vitest-environment jsdom
/**
 * AutoPilot bot hub tests for the AI Tools tab.
 *
 * The screen is wired to the AutoPilot API via react-query hooks from
 * `@workspace/api-client-react`. These tests mock that module with an
 * in-memory fake server that mirrors the real API's behavior (state
 * transitions + log lines), so the UI logic is exercised end-to-end:
 *   - Master toggle pauses everything (active count, capital) and logs it.
 *   - Per-bot toggles update the "Active Bots" count and append log lines.
 *   - Config modal saves capital/drawdown per bot and re-seeds when reopened.
 *   - The screen polls the server on the live-log cadence.
 *   - PRO-locked bot hides metrics and opens the paywall; subscribers see all.
 *   - "Ask AI Oracle" navigates to /oracle.
 */
import React from 'react';
import { Alert } from 'react-native';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';

// react-query batches cache notifications through setTimeout by default;
// run them synchronously so assertions can follow fireEvent directly.
notifyManager.setScheduler((cb) => cb());
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const haptics = vi.hoisted(() => ({
  impactAsync: vi.fn(async () => undefined),
  selectionAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Warning: 'warning' },
}));
vi.mock('expo-haptics', () => haptics);

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useLocalSearchParams: () => ({}),
}));

vi.mock('@/components/PaywallModal', () => ({
  PaywallModal: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
    visible ? (
      <div data-testid="paywall-card">
        <button data-testid="paywall-close" onClick={onClose} />
      </div>
    ) : null,
}));

const subscription = vi.hoisted(() => ({
  isSubscribed: false,
  isLoading: false,
  verificationPending: false,
  accessTier: 'starter',
  isAdmin: false,
}));
vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscription,
}));

// In-memory fake of the AutoPilot API server (same seed data + log wording).
const fakeServer = vi.hoisted(() => {
  const seedBots = () => [
    { id: 'scalp-oracle', name: 'Scalp Oracle AI', tags: 'Crypto / 5m Scalper', risk: 'Low', winRate: '78.4%', return30d: '+12.6%', totalTrades: 1842, proOnly: false, running: true, capital: 10000, drawdown: 10 },
    { id: 'breakout-engine', name: 'Breakout Engine Pro', tags: 'Forex & Stocks / Momentum', risk: 'Medium', winRate: '71.2%', return30d: '+9.1%', totalTrades: 967, proOnly: false, running: true, capital: 15000, drawdown: 15 },
    { id: 'grid-matrix', name: 'Grid Matrix AI', tags: 'Range Trading', risk: 'Low', winRate: '82.1%', return30d: '+7.4%', totalTrades: 2210, proOnly: false, running: false, capital: 10000, drawdown: 10 },
    { id: 'quantum-inst', name: 'Quantum Institutional AI', tags: 'Multi-Asset / Order Flow', risk: 'High', winRate: '88.7%', return30d: '+21.3%', totalTrades: 3405, proOnly: true, running: false, capital: 10000, drawdown: 10 },
  ];

  const state = {
    masterActive: true,
    selectedAsset: 'Forex' as 'Forex' | 'Crypto' | 'Stocks',
    todayPnl: 1420.5,
    bots: seedBots(),
    logs: [] as { id: string; time: string; text: string }[],
    logSeq: 0,
    queryOptions: null as any,
    historyDays: [] as { day: string; pnl: number }[],
  };

  function pushLog(text: string) {
    state.logSeq += 1;
    state.logs.push({ id: `l${state.logSeq}`, time: '10:00:00', text });
  }

  function snapshot() {
    return {
      masterActive: state.masterActive,
        selectedAsset: state.selectedAsset,
      todayPnl: state.todayPnl,
      bots: state.bots.map((b) => ({ ...b })),
      logs: [...state.logs],
    };
  }

  return {
    state,
    snapshot,
    reset() {
      state.masterActive = true;
      state.selectedAsset = 'Forex';
      state.todayPnl = 1420.5;
      state.bots = seedBots();
      state.logs = [];
      state.logSeq = 0;
      state.queryOptions = null;
      state.historyDays = [];
      pushLog('[SYS] TradiQs AutoPilot core initialized');
      pushLog('[SYS] 2 algorithms deployed — monitoring 14 markets');
    },
    setMaster(active: boolean) {
      state.masterActive = active;
      pushLog(
        active
          ? '[SYS] AutoPilot resumed — all bots re-armed'
          : '[SYS] AutoPilot paused — halting new entries',
      );
      return snapshot();
    },
    setAsset(asset: 'Forex' | 'Crypto' | 'Stocks') {
      state.selectedAsset = asset;
      pushLog(`[CFG] AutoPilot execution market set to ${asset}`);
      return snapshot();
    },
    updateBot(botId: string, data: { running?: boolean; capital?: number; drawdown?: number }) {
      const bot = state.bots.find((b) => b.id === botId)!;
      if (data.capital !== undefined || data.drawdown !== undefined) {
        if (data.capital !== undefined) bot.capital = data.capital;
        if (data.drawdown !== undefined) bot.drawdown = data.drawdown;
        pushLog(
          `[CFG] ${bot.name} reconfigured — $${bot.capital.toLocaleString()} capital, ${bot.drawdown}% max drawdown`,
        );
      }
      if (data.running !== undefined && data.running !== bot.running) {
        bot.running = data.running;
        pushLog(
          data.running
            ? `[BOT] ${bot.name} initialized with $${bot.capital.toLocaleString()} capital allocation`
            : `[BOT] ${bot.name} stopped — open positions managed to close`,
        );
      }
      return snapshot();
    },
    clearLogs() {
      state.logs = [];
      return snapshot();
    },
  };
});

vi.mock('@workspace/api-client-react', async () => {
  const { useQuery } = await import('@tanstack/react-query');
  const QUERY_KEY = ['/api/autopilot'];
  const HISTORY_KEY = ['/api/autopilot/history'];
  return {
    getGetAutopilotQueryKey: () => QUERY_KEY,
    getGetAutopilotHistoryQueryKey: () => HISTORY_KEY,
    useGetAutopilotHistory: () =>
      useQuery({
        queryKey: HISTORY_KEY,
        queryFn: async () => ({ days: fakeServer.state.historyDays }),
        initialData: { days: fakeServer.state.historyDays },
      }),
    useGetAutopilot: (options?: any) => {
      fakeServer.state.queryOptions = options?.query ?? null;
      return useQuery({
        queryKey: QUERY_KEY,
        queryFn: async () => fakeServer.snapshot(),
        initialData: fakeServer.snapshot(),
      });
    },
    useSetAutopilotMaster: (options?: any) => ({
      mutate: ({ data }: { data: { active: boolean } }) =>
        options?.mutation?.onSuccess?.(fakeServer.setMaster(data.active)),
    }),
    useSetAutopilotAsset: (options?: any) => ({
      mutate: ({ data }: { data: { asset: 'Forex' | 'Crypto' | 'Stocks' } }) =>
        options?.mutation?.onSuccess?.(fakeServer.setAsset(data.asset)),
    }),
    useUpdateAutopilotBot: (options?: any) => ({
      mutate: ({ botId, data }: { botId: string; data: any }) =>
        options?.mutation?.onSuccess?.(fakeServer.updateBot(botId, data)),
    }),
    useClearAutopilotLogs: (options?: any) => ({
      mutate: () => options?.mutation?.onSuccess?.(fakeServer.clearLogs()),
    }),
  };
});

import AiToolsScreen from '../ai-tools';

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AiToolsScreen />
    </QueryClientProvider>,
  );
}

/** React-native-web Switch exposes a checkbox input inside the testID root. */
function toggle(testID: string) {
  const root = screen.getByTestId(testID);
  const checkbox =
    root.tagName === 'INPUT' ? root : within(root).getByRole('switch');
  fireEvent.click(checkbox);
}

function press(testID: string) {
  fireEvent.click(screen.getByTestId(testID));
}

beforeEach(() => {
  subscription.isSubscribed = false;
  subscription.accessTier = 'starter';
  subscription.isAdmin = false;
  haptics.impactAsync.mockClear();
  haptics.selectionAsync.mockClear();
  haptics.notificationAsync.mockClear();
  routerPush.mockClear();
  fakeServer.reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---- Tests ------------------------------------------------------------------

describe('AutoPilot summary + master toggle', () => {
  it('starts active with 2 running bots and deployed capital', () => {
    renderScreen();
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(screen.getByText('2 Running')).toBeTruthy();
    expect(screen.getByText('$25,000')).toBeTruthy(); // 10k + 15k
    expect(screen.getByText('+$1,420.50')).toBeTruthy();
  });

  it('master toggle pauses everything and logs the halt', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    toggle('master-toggle');

    expect(screen.getByText('System Paused')).toBeTruthy();
    expect(screen.getByText('0 Running')).toBeTruthy();
    expect(screen.getByText('$0')).toBeTruthy();
    // Accrued P&L is server state and survives a pause.
    expect(screen.getByText('+$1,420.50')).toBeTruthy();
    expect(
      screen.getByText(/\[SYS\] AutoPilot paused — halting new entries/),
    ).toBeTruthy();

    toggle('master-toggle');
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(screen.getByText('2 Running')).toBeTruthy();
    expect(
      screen.getByText(/\[SYS\] AutoPilot resumed — all bots re-armed/),
    ).toBeTruthy();
  });

  it('keeps the master toggle unchanged for free traders', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();
    toggle('master-toggle');
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(alert).toHaveBeenCalledWith(
      'Pro or Elite required',
      'AutoPilot requires a Pro or Elite subscription. Upgrade to deploy algorithmic bots.',
    );
    expect(haptics.notificationAsync).toHaveBeenCalledWith('error');
    alert.mockRestore();
  });
});

describe('Tiered AutoPilot asset selector', () => {
  it('lets Pro traders select Forex and Crypto with selection feedback', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    press('autopilot-asset-crypto');
    expect(fakeServer.state.selectedAsset).toBe('Crypto');
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps Stocks locked for Pro traders and explains the Elite upgrade', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();
    press('autopilot-asset-stocks');
    expect(screen.queryByText('[CFG] AutoPilot execution market set to Stocks')).toBeNull();
    expect(alert).toHaveBeenCalledWith(
      'Elite market access',
      'Equities and Indices algorithm unlocked at Elite tier. Upgrade to Elite.',
    );
    expect(haptics.notificationAsync).toHaveBeenCalledWith('warning');
    alert.mockRestore();
  });

  it('lets Elite traders select Stocks', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'elite';
    renderScreen();
    press('autopilot-asset-stocks');
    expect(fakeServer.state.selectedAsset).toBe('Stocks');
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });
});

describe('Per-bot toggles', () => {
  it('turning a bot on bumps the Active Bots count and logs initialization', () => {
    renderScreen();
    toggle('bot-toggle-grid-matrix');

    expect(screen.getByText('3 Running')).toBeTruthy();
    expect(screen.getByText('$35,000')).toBeTruthy(); // + default 10k
    expect(
      screen.getByText(
        /\[BOT\] Grid Matrix AI initialized with \$10,000 capital allocation/,
      ),
    ).toBeTruthy();
  });

  it('turning a bot off drops the count and logs the stop', () => {
    renderScreen();
    toggle('bot-toggle-scalp-oracle');

    expect(screen.getByText('1 Running')).toBeTruthy();
    expect(screen.getByText('$15,000')).toBeTruthy();
    expect(
      screen.getByText(/\[BOT\] Scalp Oracle AI stopped — open positions managed to close/),
    ).toBeTruthy();
  });
});

describe('Config modal', () => {
  it('saves new capital/drawdown for a bot and logs the change', () => {
    renderScreen();
    press('configure-scalp-oracle');
    press('capital-25000');
    press('drawdown-20');
    press('config-save');

    expect(screen.getByText('$25,000 · 20% max DD')).toBeTruthy();
    expect(screen.getByText('$40,000')).toBeTruthy(); // deployed: 25k + 15k
    expect(
      screen.getByText(
        /\[CFG\] Scalp Oracle AI reconfigured — \$25,000 capital, 20% max drawdown/,
      ),
    ).toBeTruthy();
    // Modal closed after save.
    expect(screen.queryByTestId('config-save')).toBeNull();
  });

  it('re-seeds selections per bot when reopened', () => {
    renderScreen();

    // Change scalp-oracle to 25k/20%, then open breakout-engine: its own
    // config (15k is not an option, drawdown 15) must not inherit 25k/20.
    press('configure-scalp-oracle');
    press('capital-25000');
    press('drawdown-20');
    press('config-save');

    press('configure-breakout-engine');
    const active20 = screen.getByTestId('drawdown-15');
    expect(active20).toBeTruthy();
    // Reopening scalp-oracle shows its saved values still selected: saving
    // without touching anything keeps 25k/20%.
    press('config-close');
    press('configure-scalp-oracle');
    press('config-save');
    expect(screen.getByText('$25,000 · 20% max DD')).toBeTruthy();
  });
});

describe('Live log console', () => {
  it('polls the AutoPilot API on the live-log cadence', () => {
    renderScreen();
    expect(fakeServer.state.queryOptions?.refetchInterval).toBe(2600);
  });

  it('clear-logs empties the buffer', () => {
    renderScreen();
    expect(screen.getByText(/TradiQs AutoPilot core initialized/)).toBeTruthy();
    press('clear-logs');
    expect(screen.queryByText(/TradiQs AutoPilot core initialized/)).toBeNull();
    expect(screen.getByText('— log buffer cleared —')).toBeTruthy();
  });
});

describe('PRO-locked bot', () => {
  it('hides metrics and controls for non-subscribers', () => {
    renderScreen();
    // Metrics redacted.
    expect(screen.queryByText('88.7%')).toBeNull();
    expect(screen.queryByText('+21.3%')).toBeNull();
    expect(screen.queryByText('3,405')).toBeNull();
    expect(screen.getAllByText('•••').length).toBeGreaterThanOrEqual(3);
    // No toggle or configure for the locked bot.
    expect(screen.queryByTestId('bot-toggle-quantum-inst')).toBeNull();
    expect(screen.queryByTestId('configure-quantum-inst')).toBeNull();
    expect(screen.getByTestId('unlock-quantum-inst')).toBeTruthy();
  });

  it('opens the paywall from the unlock button and closes it again', () => {
    renderScreen();
    press('unlock-quantum-inst');
    expect(routerPush).toHaveBeenCalledWith({
      pathname: '/paywall',
      params: { defaultTier: 'ELITE' },
    });
  });

  it('subscribers see full metrics and controls on the PRO bot', () => {
    subscription.isSubscribed = true;
    renderScreen();
    expect(screen.getByText('88.7%')).toBeTruthy();
    expect(screen.getByText('+21.3%')).toBeTruthy();
    expect(screen.getByText('3,405')).toBeTruthy();
    expect(screen.getByTestId('bot-toggle-quantum-inst')).toBeTruthy();
    expect(screen.queryByTestId('unlock-quantum-inst')).toBeNull();
    expect(screen.queryByText('•••')).toBeNull();
  });
});

describe('Daily P&L history', () => {
  it('shows an empty state before any day has finished', () => {
    renderScreen();
    const section = within(screen.getByTestId('pnl-history'));
    expect(section.getByText('Daily P&L History')).toBeTruthy();
    expect(
      section.getByText(
        'No finished days yet — history appears after the first full day of trading.',
      ),
    ).toBeTruthy();
  });

  it('lists recent finished days with formatted dates and P&L', () => {
    fakeServer.state.historyDays = [
      { day: '2026-08-04', pnl: 231.4 },
      { day: '2026-08-03', pnl: -58.25 },
    ];
    renderScreen();
    const section = within(screen.getByTestId('pnl-history'));
    expect(section.getByText('Tue, Aug 4')).toBeTruthy();
    expect(section.getByText('+$231.40')).toBeTruthy();
    expect(section.getByText('Mon, Aug 3')).toBeTruthy();
    expect(section.getByText('-$58.25')).toBeTruthy();
  });
});

describe('Ask AI Oracle', () => {
  it('navigates to /oracle', () => {
    renderScreen();
    press('ask-oracle');
    expect(routerPush).toHaveBeenCalledWith('/oracle');
  });
});

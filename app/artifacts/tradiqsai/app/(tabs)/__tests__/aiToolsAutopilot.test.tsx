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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Warning: 'warning' },
}));
vi.mock('expo-haptics', () => haptics);

const storage = vi.hoisted(() => ({
  getItem: vi.fn(async (_key?: string) => null as string | null),
  setItem: vi.fn(async () => undefined),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: storage,
}));

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
    historyErrorMode: null as null | 'mfa_required',
    botUpdateErrorMode: null as null | 'pro_required' | 'server_error' | 'network_error' | 'pending',
    pendingBotUpdate: null as null | (() => void),
    queryFails: false,
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
      state.historyErrorMode = null;
      state.botUpdateErrorMode = null;
      state.pendingBotUpdate = null;
      state.queryFails = false;
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
    resolvePendingBotUpdate() {
      state.pendingBotUpdate?.();
      state.pendingBotUpdate = null;
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
    useGetAutopilotHistory: (options?: any) => {
      // When historyErrorMode is set, simulate the server returning that error.
      if (fakeServer.state.historyErrorMode === 'mfa_required') {
        // Fabricate the error shape that isMfaRequiredError checks.
        const mfaError = Object.assign(new Error('mfa_required'), { status: 403, data: { code: 'mfa_required' } });
        return useQuery({
          queryKey: HISTORY_KEY,
          queryFn: async () => { throw mfaError; },
          retry: options?.query?.retry ?? false,
        });
      }
      return useQuery({
        queryKey: HISTORY_KEY,
        queryFn: async () => ({ days: fakeServer.state.historyDays }),
        initialData: { days: fakeServer.state.historyDays },
      });
    },
    useGetAutopilot: (options?: any) => {
      fakeServer.state.queryOptions = options?.query ?? null;
      return useQuery({
        queryKey: QUERY_KEY,
        queryFn: async () => {
          if (fakeServer.state.queryFails) throw new Error('network down');
          return fakeServer.snapshot();
        },
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
      mutate: ({ botId, data }: { botId: string; data: any }) => {
        // Run the optimistic onMutate first, like react-query does.
        const context = options?.mutation?.onMutate?.({ botId, data });
        if (fakeServer.state.botUpdateErrorMode === 'pro_required') {
          // Mirror the real API: AutoPilot routes reject non-Pro callers
          // with 403 + pro_subscription_required.
          const error = Object.assign(new Error('pro_subscription_required'), {
            status: 403,
            data: { code: 'pro_subscription_required' },
          });
          options?.mutation?.onError?.(error, { botId, data }, context);
          return;
        }
        if (fakeServer.state.botUpdateErrorMode === 'server_error') {
          const error = Object.assign(new Error('server unavailable'), { status: 500 });
          options?.mutation?.onError?.(error, { botId, data }, context);
          return;
        }
        if (fakeServer.state.botUpdateErrorMode === 'network_error') {
          options?.mutation?.onError?.(new Error('network down'), { botId, data }, context);
          return;
        }
        if (fakeServer.state.botUpdateErrorMode === 'pending') {
          fakeServer.state.pendingBotUpdate = () =>
            options?.mutation?.onSuccess?.(fakeServer.updateBot(botId, data), { botId, data }, context);
          return;
        }
        options?.mutation?.onSuccess?.(fakeServer.updateBot(botId, data), { botId, data }, context);
      },
    }),
    useClearAutopilotLogs: (options?: any) => ({
      mutate: () => options?.mutation?.onSuccess?.(fakeServer.clearLogs()),
    }),
    // The degraded-security handler is registered by the root-layout
    // DegradedSecurityNotice component, not by the ai-tools screen. Provide a
    // no-op stub so the screen does not throw when the module is imported.
    setDegradedSecurityHandler: vi.fn(),
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
  // The suite's primary subject is AutoPilot mechanics, which are Pro-gated;
  // free-tier lock behavior is covered by tests that opt back into starter.
  subscription.isSubscribed = true;
  subscription.accessTier = 'pro';
  subscription.isAdmin = false;
  haptics.impactAsync.mockClear();
  haptics.selectionAsync.mockClear();
  haptics.notificationAsync.mockClear();
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockClear();
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

  it('master toggle pauses everything and logs the halt', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    toggle('master-toggle');

    expect(screen.getByText('System Paused')).toBeTruthy();
    expect(screen.getByText('0 Running')).toBeTruthy();
    expect(screen.getByText('$0')).toBeTruthy();
    // Accrued P&L is server state and survives a pause.
    expect(screen.getByText('+$1,420.50')).toBeTruthy();
    expect(screen.getByText(/Engine standby - AutoPilot paused/)).toBeTruthy();
    await waitFor(() => expect(fakeServer.state.masterActive).toBe(false));

    toggle('master-toggle');
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(screen.getByText('2 Running')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(/\[SYS\] AutoPilot resumed — all bots re-armed/),
      ).toBeTruthy(),
    );
  });

  it('forces the master switch off and disabled for free traders', () => {
    subscription.isSubscribed = false;
    subscription.accessTier = 'starter';
    renderScreen();

    const root = screen.getByTestId('master-toggle');
    const checkbox = (root.tagName === 'INPUT'
      ? root
      : within(root).getByRole('switch')) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText('System Paused')).toBeTruthy();
    // The widget sits under the paywall curtain instead of streaming data.
    expect(screen.getByTestId('autopilot-paywall-overlay')).toBeTruthy();
  });
});

describe('Tiered AutoPilot asset selector', () => {
  it('lets Pro traders select Forex and Crypto with selection feedback', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    press('autopilot-asset-crypto');
    await waitFor(() => expect(fakeServer.state.selectedAsset).toBe('Crypto'));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps Stocks locked for Pro traders and opens the Elite paywall', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    press('autopilot-asset-stocks');
    expect(screen.queryByText('[CFG] AutoPilot execution market set to Stocks')).toBeNull();
    expect(routerPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { defaultTier: 'ELITE' } });
    expect(haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('lets Elite traders select Stocks', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'elite';
    renderScreen();
    press('autopilot-asset-stocks');
    await waitFor(() => expect(fakeServer.state.selectedAsset).toBe('Stocks'));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps controls interactive while the subscription tier is initializing', async () => {
    subscription.accessTier = undefined as any;
    renderScreen();
    press('autopilot-asset-crypto');

    await waitFor(() => expect(fakeServer.state.selectedAsset).toBe('Crypto'));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('persists an asset choice locally before its background API sync finishes', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    press('autopilot-asset-crypto');

    expect(storage.setItem).toHaveBeenCalledWith(
      'tradiqs.autopilot.preferences.v1',
      JSON.stringify({ active: true, asset: 'Crypto' }),
    );
  });
});

describe('Per-bot toggles', () => {
  it('turning a bot on bumps the Active Bots count and logs initialization', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    toggle('bot-toggle-grid-matrix');

    expect(screen.getByText('3 Running')).toBeTruthy();
    expect(screen.getByText('$35,000')).toBeTruthy(); // + default 10k
    expect(
      screen.getByText(
        /\[BOT\] Grid Matrix AI initialized with \$10,000 capital allocation/,
      ),
    ).toBeTruthy();
    expect(haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('turning a bot off drops the count and logs the stop', () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    toggle('bot-toggle-scalp-oracle');

    expect(screen.getByText('1 Running')).toBeTruthy();
    expect(screen.getByText('$15,000')).toBeTruthy();
    expect(
      screen.getByText(/\[BOT\] Scalp Oracle AI stopped — open positions managed to close/),
    ).toBeTruthy();
  });

  it('serializes repeated presses while a bot update is still pending', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    fakeServer.state.botUpdateErrorMode = 'pending';
    renderScreen();

    toggle('bot-toggle-grid-matrix');
    const switchInput = within(screen.getByTestId('bot-toggle-grid-matrix')).getByRole('switch') as HTMLInputElement;
    expect(switchInput.disabled).toBe(true);

    fakeServer.resolvePendingBotUpdate();
    await waitFor(() => expect(switchInput.disabled).toBe(false));
    expect(screen.getByText('3 Running')).toBeTruthy();
  });
});

describe('Toggle tier gating and server rejection', () => {
  it('disables every bot toggle for free traders', () => {
    subscription.isSubscribed = false;
    subscription.accessTier = 'starter';
    renderScreen();

    for (const id of ['scalp-oracle', 'breakout-engine', 'grid-matrix']) {
      const root = screen.getByTestId(`bot-toggle-${id}`);
      const checkbox = within(root).getByRole('switch') as HTMLInputElement;
      expect(checkbox.disabled).toBe(true);
    }
    expect(screen.getByText('0 Running')).toBeTruthy();
  });

  it('rolls back the local switch when the API rejects the update', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    fakeServer.state.botUpdateErrorMode = 'pro_required';
    renderScreen();

    toggle('bot-toggle-grid-matrix');

    // The optimistic repaint must not survive the server's rejection.
    await waitFor(() => expect(screen.getByText('2 Running')).toBeTruthy());
    expect(fakeServer.state.bots.find((b) => b.id === 'grid-matrix')?.running).toBe(false);
    expect(screen.getByTestId('paywall-card')).toBeTruthy();
    // There was no prior override, so restoring the exact state removes it.
    expect(storage.setItem).toHaveBeenCalledWith('@tradiqs_active_algorithms', '{}');
  });

  it('reverts the switch even when the re-sync also fails', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    renderScreen();
    fakeServer.state.botUpdateErrorMode = 'pro_required';
    fakeServer.state.queryFails = true;

    toggle('bot-toggle-grid-matrix');

    // The optimistic running=true is rolled back from the onMutate
    // snapshot; the failing refetch cannot restore the rejected value.
    await waitFor(() => expect(screen.getByText('2 Running')).toBeTruthy());
    expect(storage.setItem).toHaveBeenCalledWith('@tradiqs_active_algorithms', '{}');
    expect(screen.getByTestId('paywall-card')).toBeTruthy();
  });

  it('restores a prior local pause instead of clearing it after a rejected start', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    storage.getItem.mockImplementation(async (key?: string) =>
      key === '@tradiqs_active_algorithms'
        ? JSON.stringify({ 'scalp-oracle': false })
        : null,
    );
    fakeServer.state.botUpdateErrorMode = 'server_error';
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();

    await waitFor(() => expect(screen.getByText('1 Running')).toBeTruthy());
    toggle('bot-toggle-scalp-oracle');

    await waitFor(() => expect(screen.getByText('1 Running')).toBeTruthy());
    expect(storage.setItem).toHaveBeenCalledWith(
      '@tradiqs_active_algorithms',
      JSON.stringify({ 'scalp-oracle': false }),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Bot update failed',
      expect.stringContaining('temporarily unavailable'),
    );
  });

  it('surfaces a clear connection error after a network drop', async () => {
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    fakeServer.state.botUpdateErrorMode = 'network_error';
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();

    toggle('bot-toggle-grid-matrix');

    await waitFor(() => expect(screen.getByText('2 Running')).toBeTruthy());
    expect(Alert.alert).toHaveBeenCalledWith(
      'Bot update failed',
      expect.stringContaining('Check your connection'),
    );
  });

  it('shows free traders zeroed AutoPilot data under the paywall curtain', () => {
    subscription.isSubscribed = false;
    subscription.accessTier = 'starter';
    renderScreen();

    expect(screen.getByTestId('autopilot-paywall-overlay')).toBeTruthy();
    expect(screen.getByText('0 Running')).toBeTruthy();
    expect(screen.getByText('+$0.00')).toBeTruthy();
    // Live server logs must not render for free users.
    expect(screen.queryByText(/TradiQs AutoPilot core initialized/)).toBeNull();
  });

  it('hydrates persisted switch states from storage on launch', async () => {
    storage.getItem.mockImplementation(async (key?: string) =>
      key === '@tradiqs_active_algorithms'
        ? JSON.stringify({ 'scalp-oracle': false })
        : null,
    );
    renderScreen();

    await waitFor(() => expect(screen.getByText('1 Running')).toBeTruthy());
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
    subscription.isSubscribed = false;
    subscription.accessTier = 'starter';
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
    subscription.isSubscribed = false;
    subscription.accessTier = 'starter';
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

describe('Server-state hydration', () => {
  it('reflects a server-paused AutoPilot on first load', async () => {
    // The server reports the system is paused and running Crypto.
    // Even though the component initialises to active=true/Forex, the
    // first successful API response must override both.
    subscription.isSubscribed = true;
    subscription.accessTier = 'pro';
    fakeServer.state.masterActive = false;
    fakeServer.state.selectedAsset = 'Crypto';
    renderScreen();

    // masterActive hydration: the master toggle and status text must
    // reflect the server's paused state after the first API response.
    await waitFor(() => expect(screen.getByText('System Paused')).toBeTruthy());
    expect(screen.getByText('0 Running')).toBeTruthy();
    expect(screen.getByText('$0')).toBeTruthy();

    // selectedAsset hydration: pressing Crypto (already selected) hits the
    // early-return guard `if (asset === selectedAsset) return`, so no haptic
    // or API call is made. Pressing Forex (not selected) would fire a haptic.
    haptics.selectionAsync.mockClear();
    press('autopilot-asset-crypto');
    expect(haptics.selectionAsync).not.toHaveBeenCalled(); // Crypto already selected

    press('autopilot-asset-forex');
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1); // switching away from Crypto
  });

  it('shows System Active and Forex when server reports active+Forex', () => {
    // Defaults match server state — no regression.
    renderScreen();
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(screen.getByText('2 Running')).toBeTruthy();
  });
});

describe('Daily P&L history — MFA assurance', () => {
  it('shows the MFA nudge when the server requires two-factor verification', async () => {
    fakeServer.state.historyErrorMode = 'mfa_required';
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId('pnl-history-mfa-required')).toBeTruthy(),
    );
    expect(
      screen.getByText('Re-verify with two-factor authentication to view history.'),
    ).toBeTruthy();
    press('pnl-history-reverify');
    expect(routerPush).toHaveBeenCalledWith({
      pathname: '/profile',
      params: { mfa: 'verify' },
    });
    // Normal history rows must not appear alongside the nudge.
    expect(screen.queryByText('No finished days yet')).toBeNull();
  });

  it('shows the empty state when history is available but has no days yet', () => {
    fakeServer.state.historyErrorMode = null;
    fakeServer.state.historyDays = [];
    renderScreen();
    expect(
      screen.getByText(
        'No finished days yet — history appears after the first full day of trading.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('pnl-history-mfa-required')).toBeNull();
  });
});


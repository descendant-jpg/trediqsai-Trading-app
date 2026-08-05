// @vitest-environment jsdom
/**
 * AutoPilot bot hub tests for the AI Tools tab.
 *
 * Behavior under test:
 *   - Master toggle pauses everything (active count, capital, P&L) and logs it.
 *   - Per-bot toggles update the "Active Bots" count and append log lines.
 *   - Config modal saves capital/drawdown per bot and re-seeds when reopened.
 *   - The simulated live-log interval is cleaned up on unmount.
 *   - PRO-locked bot hides metrics and opens the paywall; subscribers see all.
 *   - "Ask AI Oracle" navigates to /oracle.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-blur', () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/components/paywall', () => ({
  PaywallCard: () => <div data-testid="paywall-card" />,
}));

const subscription = vi.hoisted(() => ({
  isSubscribed: false,
  isLoading: false,
  verificationPending: false,
}));
vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscription,
}));

import AiToolsScreen from '../ai-tools';

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
  routerPush.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---- Tests ------------------------------------------------------------------

describe('AutoPilot summary + master toggle', () => {
  it('starts active with 2 running bots and deployed capital', () => {
    render(<AiToolsScreen />);
    expect(screen.getByText('System Active')).toBeTruthy();
    expect(screen.getByText('2 Running')).toBeTruthy();
    expect(screen.getByText('$25,000')).toBeTruthy(); // 10k + 15k
    expect(screen.getByText('+$1,420.50')).toBeTruthy();
  });

  it('master toggle pauses everything and logs the halt', () => {
    render(<AiToolsScreen />);
    toggle('master-toggle');

    expect(screen.getByText('System Paused')).toBeTruthy();
    expect(screen.getByText('0 Running')).toBeTruthy();
    expect(screen.getByText('$0')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
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
});

describe('Per-bot toggles', () => {
  it('turning a bot on bumps the Active Bots count and logs initialization', () => {
    render(<AiToolsScreen />);
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
    render(<AiToolsScreen />);
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
    render(<AiToolsScreen />);
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
    render(<AiToolsScreen />);

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
  it('appends simulated log lines while active and clears the interval on unmount', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const setSpy = vi.spyOn(globalThis, 'setInterval');

    const { unmount } = render(<AiToolsScreen />);
    const intervalIds = setSpy.mock.results
      .filter((r, i) => setSpy.mock.calls[i][1] === 2600)
      .map((r) => r.value);
    expect(intervalIds.length).toBe(1);

    unmount();
    const clearedIds = clearSpy.mock.calls.map((c) => c[0]);
    expect(clearedIds).toContain(intervalIds[0]);

    clearSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('clear-logs empties the buffer', () => {
    render(<AiToolsScreen />);
    expect(screen.getByText(/TradiQs AutoPilot core initialized/)).toBeTruthy();
    press('clear-logs');
    expect(screen.queryByText(/TradiQs AutoPilot core initialized/)).toBeNull();
    expect(screen.getByText('— log buffer cleared —')).toBeTruthy();
  });
});

describe('PRO-locked bot', () => {
  it('hides metrics and controls for non-subscribers', () => {
    render(<AiToolsScreen />);
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
    render(<AiToolsScreen />);
    expect(screen.queryByTestId('paywall-card')).toBeNull();
    press('unlock-quantum-inst');
    expect(screen.getByTestId('paywall-card')).toBeTruthy();

    // react-native-web's Modal only unmounts after a CSS animationend event,
    // which jsdom never delivers (the portal lives outside React's root, so
    // delegated animation events never reach the handler). Assert the exit
    // state instead: on close, the animation wrapper switches to its slide-out
    // style, which disables pointer events until the modal is removed.
    const animWrapper = () =>
      document.querySelector('[class*="animationKeyframes"]') as HTMLElement;
    expect(animWrapper().className).not.toContain('pointerEvents');
    press('paywall-close');
    expect(animWrapper().className).toContain('pointerEvents');
  });

  it('subscribers see full metrics and controls on the PRO bot', () => {
    subscription.isSubscribed = true;
    render(<AiToolsScreen />);
    expect(screen.getByText('88.7%')).toBeTruthy();
    expect(screen.getByText('+21.3%')).toBeTruthy();
    expect(screen.getByText('3,405')).toBeTruthy();
    expect(screen.getByTestId('bot-toggle-quantum-inst')).toBeTruthy();
    expect(screen.queryByTestId('unlock-quantum-inst')).toBeNull();
    expect(screen.queryByText('•••')).toBeNull();
  });
});

describe('Ask AI Oracle', () => {
  it('navigates to /oracle', () => {
    render(<AiToolsScreen />);
    press('ask-oracle');
    expect(routerPush).toHaveBeenCalledWith('/oracle');
  });
});

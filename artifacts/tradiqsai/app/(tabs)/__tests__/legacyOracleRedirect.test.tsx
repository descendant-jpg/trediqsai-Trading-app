// @vitest-environment jsdom
/**
 * Legacy Oracle chat deep-link tests.
 *
 * The Oracle chat moved from the AI Tools tab to its own `/oracle` screen.
 * Old navigation targets like `/(tabs)/ai-tools?chat=1` (or `?view=chat`,
 * `?screen=oracle`) must still land on the chat: the AI Tools screen
 * redirects them via `router.replace('/oracle')`.
 */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { legacyOracleRedirectTarget } from '@/lib/legacyOracleRedirect';

// ---- Mocks ------------------------------------------------------------------

const { replace, push, routeParams } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  routeParams: { current: {} as Record<string, string | string[] | undefined> },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace, push, back: vi.fn() }),
  useLocalSearchParams: () => routeParams.current,
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('expo-blur', () => ({ BlurView: () => null }));
vi.mock('@/components/paywall', () => ({ PaywallCard: () => null }));
vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => ({ isSubscribed: false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));
vi.mock('@workspace/api-client-react', () => ({
  getGetAutopilotQueryKey: () => ['/api/autopilot'],
  getGetAutopilotHistoryQueryKey: () => ['/api/autopilot/history'],
  useGetAutopilotHistory: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetAutopilot: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
  }),
  useSetAutopilotMaster: () => ({ mutate: vi.fn() }),
  useUpdateAutopilotBot: () => ({ mutate: vi.fn() }),
  useClearAutopilotLogs: () => ({ mutate: vi.fn() }),
}));

import AiToolsScreen from '../ai-tools';

// ---- Helpers ----------------------------------------------------------------

async function renderWithParams(
  params: Record<string, string | string[] | undefined>,
) {
  routeParams.current = params;
  const view = render(<AiToolsScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
  push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---- Tests ------------------------------------------------------------------

describe('legacyOracleRedirectTarget (pure mapping)', () => {
  it('maps legacy chat params to /oracle', () => {
    expect(legacyOracleRedirectTarget({ chat: '1' })).toBe('/oracle');
    expect(legacyOracleRedirectTarget({ chat: 'true' })).toBe('/oracle');
    expect(legacyOracleRedirectTarget({ chat: 'oracle' })).toBe('/oracle');
    expect(legacyOracleRedirectTarget({ chat: '' })).toBe('/oracle'); // bare ?chat
    expect(legacyOracleRedirectTarget({ view: 'chat' })).toBe('/oracle');
    expect(legacyOracleRedirectTarget({ view: 'Oracle' })).toBe('/oracle');
    expect(legacyOracleRedirectTarget({ screen: 'oracle' })).toBe('/oracle');
    expect(legacyOracleRedirectTarget({ chat: ['1', '0'] })).toBe('/oracle');
  });

  it('does not redirect ordinary AI Tools visits', () => {
    expect(legacyOracleRedirectTarget({})).toBeNull();
    expect(legacyOracleRedirectTarget({ chat: '0' })).toBeNull();
    expect(legacyOracleRedirectTarget({ chat: 'false' })).toBeNull();
    expect(legacyOracleRedirectTarget({ view: 'bots' })).toBeNull();
    expect(legacyOracleRedirectTarget({ screen: 'autopilot' })).toBeNull();
  });
});

describe('AI Tools screen — legacy Oracle deep links', () => {
  it('redirects a legacy ?chat=1 target to /oracle', async () => {
    await renderWithParams({ chat: '1' });
    expect(replace).toHaveBeenCalledWith('/oracle');
  });

  it('redirects a legacy ?view=chat target to /oracle', async () => {
    await renderWithParams({ view: 'chat' });
    expect(replace).toHaveBeenCalledWith('/oracle');
  });

  it('does not redirect a normal visit without legacy params', async () => {
    await renderWithParams({});
    expect(replace).not.toHaveBeenCalled();
  });
});

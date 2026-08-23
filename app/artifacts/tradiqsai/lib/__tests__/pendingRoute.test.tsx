// @vitest-environment jsdom
/**
 * Global authentication landing policy.
 *
 * Session restoration, sign-in, and sign-out must use explicit routes rather
 * than allowing Expo Router to select a route group such as Profile or Admin.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_HOME_ROUTE,
  AUTH_LOGIN_ROUTE,
  usePendingRouteRedirect,
} from '@/lib/usePendingRouteRedirect';

const { replace, routerState } = vi.hoisted(() => ({
  replace: vi.fn(),
  routerState: { pathname: '/' },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => routerState.pathname,
}));

function Harness({
  session,
  loading = false,
}: {
  session: object | null;
  loading?: boolean;
}) {
  usePendingRouteRedirect(session, loading);
  return null;
}

describe('usePendingRouteRedirect global auth policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
    routerState.pathname = '/';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['/', '/profile', '/(tabs)/profile', '/(admin)', '/oracle'])(
    'sends an authenticated launch from %s to the Home tab',
    (pathname) => {
      routerState.pathname = pathname;

      render(<Harness session={{ user: 'u1' }} />);
      act(() => vi.runAllTimers());

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(AUTH_HOME_ROUTE);
    },
  );

  it('sends a signed-out launch to the login gateway', () => {
    routerState.pathname = '/(admin)';

    render(<Harness session={null} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(AUTH_LOGIN_ROUTE);
  });

  it('sends every successful sign-in to Home rather than replaying Profile or Admin', () => {
    routerState.pathname = '/(admin)';
    const { rerender } = render(<Harness session={null} />);
    act(() => vi.runAllTimers());
    replace.mockClear();

    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(AUTH_HOME_ROUTE);
  });

  it('sends sign-out to the login gateway', () => {
    routerState.pathname = '/(tabs)/profile';
    const { rerender } = render(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());
    replace.mockClear();

    rerender(<Harness session={null} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(AUTH_LOGIN_ROUTE);
  });

  it('does not redirect again when a signed-in session refreshes', () => {
    routerState.pathname = '/(tabs)';
    const { rerender } = render(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());
    expect(replace).not.toHaveBeenCalled();

    routerState.pathname = '/(tabs)/profile';
    rerender(<Harness session={{ user: 'u1', refreshed: true }} />);
    act(() => vi.runAllTimers());

    expect(replace).not.toHaveBeenCalled();
  });

  it('waits for session restoration before choosing a route', () => {
    routerState.pathname = '/(admin)';
    const { rerender } = render(<Harness session={{ user: 'u1' }} loading />);
    act(() => vi.runAllTimers());
    expect(replace).not.toHaveBeenCalled();

    rerender(<Harness session={{ user: 'u1' }} loading={false} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledWith(AUTH_HOME_ROUTE);
  });
});
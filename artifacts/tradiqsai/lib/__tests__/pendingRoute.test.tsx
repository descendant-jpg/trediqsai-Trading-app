// @vitest-environment jsdom
/**
 * Deferred deep-link navigation after sign-in.
 *
 * Signed-out users who open a deep link see the sign-in screen; these tests
 * verify the requested route is preserved and replayed once after sign-in,
 * including legacy Oracle chat links that map to `/oracle`.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPendingRoute,
  clearPendingRoute,
  consumePendingRoute,
  setPendingRoute,
} from '@/lib/pendingRoute';

// ---- Mock expo-router -------------------------------------------------------

const { replace, routerState } = vi.hoisted(() => ({
  replace: vi.fn(),
  routerState: {
    pathname: '/',
    params: {} as Record<string, string | string[] | undefined>,
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => routerState.pathname,
  useGlobalSearchParams: () => routerState.params,
}));

import { usePendingRouteRedirect } from '@/lib/usePendingRouteRedirect';

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

describe('buildPendingRoute', () => {
  it('returns null for home / not-found routes', () => {
    expect(buildPendingRoute('/')).toBeNull();
    expect(buildPendingRoute('/+not-found')).toBeNull();
    expect(buildPendingRoute('')).toBeNull();
  });

  it('preserves ordinary routes with their query params', () => {
    expect(buildPendingRoute('/oracle')).toBe('/oracle');
    expect(buildPendingRoute('/profile', { user: 'abc' })).toBe(
      '/profile?user=abc',
    );
  });

  it('maps legacy Oracle chat links to /oracle', () => {
    expect(buildPendingRoute('/(tabs)/ai-tools', { chat: '1' })).toBe(
      '/oracle',
    );
    expect(buildPendingRoute('/ai-tools', { view: 'chat' })).toBe('/oracle');
    expect(buildPendingRoute('/ai-tools', { screen: 'oracle' })).toBe(
      '/oracle',
    );
  });

  it('keeps non-chat ai-tools links pointed at ai-tools', () => {
    expect(buildPendingRoute('/ai-tools', { chat: 'false' })).toBe(
      '/ai-tools?chat=false',
    );
    expect(buildPendingRoute('/ai-tools')).toBe('/ai-tools');
  });
});

describe('pending route store', () => {
  afterEach(() => clearPendingRoute());

  it('replays only once', () => {
    setPendingRoute('/oracle');
    expect(consumePendingRoute()).toBe('/oracle');
    expect(consumePendingRoute()).toBeNull();
  });
});

describe('usePendingRouteRedirect (deferred navigation)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
    clearPendingRoute();
    routerState.pathname = '/';
    routerState.params = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures a deep link while signed out and replays it after sign-in', () => {
    routerState.pathname = '/oracle';

    const { rerender } = render(<Harness session={null} />);
    expect(replace).not.toHaveBeenCalled();

    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/oracle');
  });

  it('maps a legacy Oracle chat deep link to /oracle after sign-in', () => {
    routerState.pathname = '/(tabs)/ai-tools';
    routerState.params = { chat: '1' };

    const { rerender } = render(<Harness session={null} />);
    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledWith('/oracle');
  });

  it('does not navigate when signing in from the home screen', () => {
    const { rerender } = render(<Harness session={null} />);
    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).not.toHaveBeenCalled();
  });

  it('does not capture routes while auth state is still loading', () => {
    routerState.pathname = '/oracle';

    const { rerender } = render(<Harness session={null} loading />);
    rerender(<Harness session={{ user: 'u1' }} loading={false} />);
    act(() => vi.runAllTimers());

    expect(replace).not.toHaveBeenCalled();
  });

  it('replays the route only once across re-renders', () => {
    routerState.pathname = '/oracle';

    const { rerender } = render(<Harness session={null} />);
    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());
    // Session object identity changes (e.g. token refresh) re-run the effect.
    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
  });
});

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
  isResolvableRoute,
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
    expect(buildPendingRoute('/signals', { highlight_id: 'abc' })).toBe(
      '/signals?highlight_id=abc',
    );
  });

  it('sends profile-tab restore attempts to the Home tab after login', () => {
    expect(buildPendingRoute('/profile')).toBe('/');
    expect(buildPendingRoute('/(tabs)/profile', { user: 'abc' })).toBe('/');
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

describe('isResolvableRoute', () => {
  it('accepts known routes, with or without query params or groups', () => {
    expect(isResolvableRoute('/oracle')).toBe(true);
    expect(isResolvableRoute('/profile?user=abc')).toBe(true);
    expect(isResolvableRoute('/(tabs)/ai-tools')).toBe(true);
    expect(isResolvableRoute('/')).toBe(true);
  });

  it('rejects routes that no longer exist', () => {
    expect(isResolvableRoute('/old-screen')).toBe(false);
    expect(isResolvableRoute('/signals/123')).toBe(false);
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

  it('routes a signed-out Profile URL to Home after sign-in', () => {
    routerState.pathname = '/profile';

    const { rerender } = render(<Harness session={null} />);
    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('routes an active-session cold start on a stale Profile URL to Home', () => {
    routerState.pathname = '/(tabs)/profile';

    render(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('does not pull users out of Profile when the session refreshes later', () => {
    routerState.pathname = '/(tabs)/profile';

    const { rerender } = render(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());
    expect(replace).toHaveBeenCalledWith('/');

    replace.mockClear();
    rerender(<Harness session={{ user: 'u1', refreshed: true }} />);
    act(() => vi.runAllTimers());

    expect(replace).not.toHaveBeenCalled();
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

  it('falls back to home with a notice when the stored route no longer resolves', () => {
    const alertSpy = vi
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined);
    routerState.pathname = '/old-screen';

    const { rerender } = render(<Harness session={null} />);
    rerender(<Harness session={{ user: 'u1' }} />);
    act(() => vi.runAllTimers());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
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

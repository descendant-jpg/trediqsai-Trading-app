// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const redirectSpy = vi.hoisted(() => vi.fn(() => null));
const authState = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  loading: false,
  authScreenMode: 'signin' as const,
}));

vi.mock('expo-router', () => ({
  Redirect: redirectSpy,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/screens/AuthScreen', () => ({
  default: () => null,
}));

import RootIndex from '../index';
import LoginScreen from '../(auth)/login';

afterEach(() => {
  cleanup();
  redirectSpy.mockClear();
  authState.session = null;
  authState.loading = false;
  authState.authScreenMode = 'signin';
});

describe('root routing entry', () => {
  it('sends an authenticated root launch to the explicit Home tab', () => {
    authState.session = { user: { id: 'u1' } };
    render(<RootIndex />);

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(tabs)' }),
      undefined,
    );
  });

  it('sends a signed-out root launch to the login gateway', () => {
    render(<RootIndex />);

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(auth)/login' }),
      undefined,
    );
  });

  it('does not choose a route while the session is restoring', () => {
    authState.loading = true;
    render(<RootIndex />);

    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('keeps the login gateway from rendering the sign-in UI after a session appears', () => {
    authState.session = { user: { id: 'u1' } };
    render(<LoginScreen />);

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(tabs)' }),
      undefined,
    );
  });
});
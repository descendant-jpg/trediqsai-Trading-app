// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const redirectSpy = vi.hoisted(() => vi.fn(() => null));
const stackSpy = vi.hoisted(() => vi.fn(() => null));
const authState = vi.hoisted(() => ({
  session: null as null | { user: { email: string } },
  loading: false,
}));
const subscriptionState = vi.hoisted(() => ({
  isAdmin: false,
  isAdminLoading: false,
}));

vi.mock('expo-router', () => {
  const Stack = stackSpy as unknown as React.ComponentType & { Screen: () => null };
  Stack.Screen = () => null;
  return { Redirect: redirectSpy, Stack };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/lib/revenuecat', () => ({
  useSubscription: () => subscriptionState,
}));

import AdminRouteLayout from '../_layout';

afterEach(() => {
  cleanup();
  redirectSpy.mockClear();
  stackSpy.mockClear();
  authState.session = null;
  authState.loading = false;
  subscriptionState.isAdmin = false;
  subscriptionState.isAdminLoading = false;
});

describe('AdminRouteLayout authorization gate', () => {
  it('sends a signed-out admin route to the login gateway', () => {
    render(<AdminRouteLayout />);

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(auth)/login' }),
      undefined,
    );
    expect(stackSpy).not.toHaveBeenCalled();
  });

  it('waits for the current user role to resolve before routing', () => {
    authState.session = { user: { email: 'admin@example.com' } };
    subscriptionState.isAdminLoading = true;
    render(<AdminRouteLayout />);

    expect(redirectSpy).not.toHaveBeenCalled();
    expect(stackSpy).not.toHaveBeenCalled();
  });

  it('sends a signed-in non-admin to Home instead of a CMS 403 screen', () => {
    authState.session = { user: { email: 'trader@example.com' } };
    render(<AdminRouteLayout />);

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(tabs)' }),
      undefined,
    );
    expect(stackSpy).not.toHaveBeenCalled();
  });

  it('renders the CMS navigator only for a resolved administrator', async () => {
    authState.session = { user: { email: 'admin@example.com' } };
    subscriptionState.isAdmin = true;
    render(<AdminRouteLayout />);

    await waitFor(() => expect(stackSpy).toHaveBeenCalled());
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});
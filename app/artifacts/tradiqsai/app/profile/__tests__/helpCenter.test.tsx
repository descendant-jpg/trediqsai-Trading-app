// @vitest-environment jsdom
/**
 * VIP Support / Help Center — ticket submission.
 *
 * Tickets go to the api-server /api/support route (service-role write into
 * the shared CMS table). These tests fake that endpoint and verify the form
 * contract: validation, payload, reference toast, clearing, spinner, and
 * the unauthenticated path.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerBack = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: routerBack, push: vi.fn() }),
}));

vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const toastShowMock = vi.hoisted(() => vi.fn());
vi.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: Object.assign(() => null, { show: toastShowMock, hide: vi.fn() }),
}));

const authState = vi.hoisted(() => ({
  current: {
    session: { user: { id: 'trader-1', email: 'pro@trader.com' } } as {
      user: { id: string; email: string };
    } | null,
  },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authState.current }));

const customFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@workspace/api-client-react', () => ({ customFetch: customFetchMock }));

import HelpCenterScreen from '../help-center';

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  authState.current = { session: { user: { id: 'trader-1', email: 'pro@trader.com' } } };
  customFetchMock.mockResolvedValue({ reference: 'TQ-000042', status: 'open' });
});

function fillAndSubmit(subject = 'PnL question', message = 'My trade closed early.') {
  fireEvent.change(screen.getByTestId('ticket-subject'), { target: { value: subject } });
  fireEvent.change(screen.getByTestId('ticket-message'), { target: { value: message } });
  fireEvent.click(screen.getByTestId('ticket-submit'));
}

describe('VIP Support — ticket submission', () => {
  it('renders the VIP Support header inside the safe area', () => {
    render(<HelpCenterScreen />);
    expect(screen.getAllByText('VIP Support').length).toBeGreaterThan(0);
  });

  it('requires a message before submitting', async () => {
    render(<HelpCenterScreen />);

    fillAndSubmit('Subject', '   ');

    expect((await screen.findByTestId('ticket-error')).textContent).toContain(
      'Describe how we can help',
    );
    expect(customFetchMock).not.toHaveBeenCalled();
  });

  it('prompts a clean sign-in error when unauthenticated', async () => {
    authState.current = { session: null };
    render(<HelpCenterScreen />);

    fillAndSubmit();

    expect((await screen.findByTestId('ticket-error')).textContent).toContain('Sign in');
    expect(customFetchMock).not.toHaveBeenCalled();
  });

  it('submits the ticket, shows the reference toast and clears the form', async () => {
    render(<HelpCenterScreen />);

    fillAndSubmit('PnL question', 'My trade closed early.');

    await waitFor(() => expect(toastShowMock).toHaveBeenCalled());
    // The client sends only subject + message; identity, email and the
    // concierge tier prefix are all resolved server-side from the JWT.
    expect(customFetchMock).toHaveBeenCalledWith(
      '/api/support',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          subject: 'PnL question',
          message: 'My trade closed early.',
        }),
      }),
    );
    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        text1: 'Ticket received',
        text2: expect.stringContaining('TQ-000042'),
      }),
    );
    expect((screen.getByTestId('ticket-subject') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('ticket-message') as HTMLTextAreaElement).value).toBe('');
  });

  it('sends an empty subject when none is given (the server supplies the default)', async () => {
    render(<HelpCenterScreen />);

    fillAndSubmit('', 'Need help with payouts.');

    await waitFor(() => expect(toastShowMock).toHaveBeenCalled());
    expect(customFetchMock).toHaveBeenCalledWith(
      '/api/support',
      expect.objectContaining({
        body: JSON.stringify({ subject: '', message: 'Need help with payouts.' }),
      }),
    );
  });

  it('shows an inline error when the API rejects the ticket', async () => {
    customFetchMock.mockRejectedValue(new Error('Unable to submit ticket. Please try again.'));
    render(<HelpCenterScreen />);

    fillAndSubmit();

    expect((await screen.findByTestId('ticket-error')).textContent).toContain(
      'Unable to submit ticket',
    );
    expect(toastShowMock).not.toHaveBeenCalled();
  });
});

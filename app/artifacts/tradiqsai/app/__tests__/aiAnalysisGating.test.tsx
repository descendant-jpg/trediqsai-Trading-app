// @vitest-environment jsdom
/**
 * Gating tests for the AI Chart Analysis screen.
 *
 * Policy under test:
 *   - 401 response → "Sign in to use Chart Analysis" gate; SIGN IN button triggers supabase.auth.signOut().
 *   - 403 response → "Chart Analysis is a Pro feature" gate; UPGRADE NOW button navigates to /paywall.
 *   - Other errors → existing generic error message is rendered in the result card.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Hoisted helpers --------------------------------------------------------

// A minimal ApiError class shared between the mock module and the test so
// `instanceof ApiError` inside the component resolves correctly.
const MockApiError = vi.hoisted(() => {
  class ApiError extends Error {
    readonly name = 'ApiError';
    readonly status: number;
    readonly statusText: string;
    readonly data: unknown;
    constructor(status: number, message = '') {
      super(message || `HTTP ${status}`);
      Object.setPrototypeOf(this, new.target.prototype);
      this.status = status;
      this.statusText = String(status);
      this.data = null;
    }
  }
  return ApiError;
});

const customFetchMock = vi.hoisted(() => vi.fn());

// ---- Module mocks -----------------------------------------------------------

vi.mock('@workspace/api-client-react', () => ({
  customFetch: customFetchMock,
  ApiError: MockApiError,
}));

vi.mock('expo-file-system', () => ({
  readAsStringAsync: vi.fn(async () => 'base64data'),
  EncodingType: { Base64: 'base64' },
}));

const signOutMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@/utils/supabase', () => ({
  supabase: { auth: { signOut: signOutMock } },
  isSupabaseConfigured: true,
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

// expo-router is already mocked globally in test/setup.ts; override here to
// capture push calls.
const routerBackMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    imageUri: 'file:///tmp/chart.jpg',
    mode: 'analysis',
    mediaType: 'image/jpeg',
  }),
  useRouter: () => ({ back: routerBackMock, push: routerPushMock }),
}));

import AIAnalysisScreen from '../ai-analysis';

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AI Chart Analysis — 401 gate', () => {
  it('shows the sign-in title and body', async () => {
    customFetchMock.mockRejectedValue(new MockApiError(401, 'Sign in required.'));
    render(<AIAnalysisScreen />);

    await waitFor(() =>
      expect(screen.getByText('Sign in to use Chart Analysis')).toBeTruthy(),
    );
    expect(
      screen.getByText('You need an account to access AI-powered chart analysis.'),
    ).toBeTruthy();
  });

  it('SIGN IN button calls supabase.auth.signOut()', async () => {
    customFetchMock.mockRejectedValue(new MockApiError(401, 'Sign in required.'));
    render(<AIAnalysisScreen />);

    await waitFor(() => screen.getByText('SIGN IN'));
    fireEvent.click(screen.getByText('SIGN IN'));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });

  it('does not show the Pro upgrade copy on a 401', async () => {
    customFetchMock.mockRejectedValue(new MockApiError(401));
    render(<AIAnalysisScreen />);

    await waitFor(() => screen.getByText('Sign in to use Chart Analysis'));
    expect(screen.queryByText('Chart Analysis is a Pro feature')).toBeNull();
    expect(screen.queryByText('UPGRADE NOW')).toBeNull();
  });
});

describe('AI Chart Analysis — 403 gate', () => {
  it('shows the Pro feature title and body', async () => {
    customFetchMock.mockRejectedValue(
      new MockApiError(403, 'Pro subscription required.'),
    );
    render(<AIAnalysisScreen />);

    await waitFor(() =>
      expect(screen.getByText('Chart Analysis is a Pro feature')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Upgrade to Pro or Elite to unlock AI-powered chart analysis and signal generation.',
      ),
    ).toBeTruthy();
  });

  it('UPGRADE NOW button navigates to /paywall with ELITE tier', async () => {
    customFetchMock.mockRejectedValue(new MockApiError(403, 'Pro subscription required.'));
    render(<AIAnalysisScreen />);

    await waitFor(() => screen.getByText('UPGRADE NOW'));
    fireEvent.click(screen.getByText('UPGRADE NOW'));

    expect(routerPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/paywall',
        params: expect.objectContaining({ defaultTier: 'ELITE' }),
      }),
    );
  });

  it('does not call signOut on a 403', async () => {
    customFetchMock.mockRejectedValue(new MockApiError(403));
    render(<AIAnalysisScreen />);

    await waitFor(() => screen.getByText('UPGRADE NOW'));
    expect(signOutMock).not.toHaveBeenCalled();
  });
});

describe('AI Chart Analysis — generic error', () => {
  it('shows the raw error message in the result card', async () => {
    customFetchMock.mockRejectedValue(new Error('Chart analysis is temporarily unavailable.'));
    render(<AIAnalysisScreen />);

    await waitFor(() =>
      expect(screen.getByText('Chart analysis is temporarily unavailable.')).toBeTruthy(),
    );
    expect(screen.queryByText('Sign in to use Chart Analysis')).toBeNull();
    expect(screen.queryByText('Chart Analysis is a Pro feature')).toBeNull();
  });

  it('shows a fallback message for non-Error throws', async () => {
    customFetchMock.mockRejectedValue('unexpected string error');
    render(<AIAnalysisScreen />);

    await waitFor(() =>
      expect(screen.getByText('Unable to analyze this chart.')).toBeTruthy(),
    );
  });
});

describe('AI Chart Analysis — success path', () => {
  it('renders the analysis result and shows the CLOSE button', async () => {
    customFetchMock.mockResolvedValue({ analysis: 'BIAS: BUY. KEY LEVELS: 1.0800.' });
    render(<AIAnalysisScreen />);

    await waitFor(() =>
      expect(screen.getByText('BIAS: BUY. KEY LEVELS: 1.0800.')).toBeTruthy(),
    );
    expect(screen.getByText('CLOSE ANALYSIS')).toBeTruthy();
  });
});

// @vitest-environment jsdom
/**
 * DegradedSecurityNoticeProvider tests.
 *
 * The root-level provider registers the global `setDegradedSecurityHandler`
 * callback and renders an amber notice for every degraded settings write.
 *
 * Tests verify:
 *  - The handler is registered on mount and cleared on unmount.
 *  - The banner appears for AutoPilot, bot, profile, broker, and MFA writes.
 *  - GET requests do not trigger the banner.
 *  - The banner auto-dismisses after 8 seconds.
 *  - The banner can be manually dismissed.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks ------------------------------------------------------------------

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

/**
 * Capture the handler registered by the component so individual tests can
 * trigger it directly.
 */
const handlerRef = vi.hoisted(
  () => ({ fn: null as null | ((ctx: { url: string; method: string }) => void) }),
);

vi.mock('@workspace/api-client-react', () => ({
  setDegradedSecurityHandler: (
    handler: ((ctx: { url: string; method: string }) => void) | null,
  ) => {
    handlerRef.fn = handler;
  },
}));

import { DegradedSecurityNoticeProvider } from '../DegradedSecurityNoticeProvider';

// ---- Helpers ----------------------------------------------------------------

function renderNotice() {
  return render(<DegradedSecurityNoticeProvider />);
}

function triggerDegraded(url: string, method: string) {
  handlerRef.fn?.({ url, method });
}

// ---- Setup / teardown -------------------------------------------------------

beforeEach(() => {
  handlerRef.fn = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---- Tests ------------------------------------------------------------------

describe('DegradedSecurityNoticeProvider handler lifecycle', () => {
  it('registers the handler on mount', () => {
    renderNotice();
    expect(handlerRef.fn).not.toBeNull();
  });

  it('clears the handler on unmount', () => {
    const { unmount } = renderNotice();
    expect(handlerRef.fn).not.toBeNull();
    unmount();
    expect(handlerRef.fn).toBeNull();
  });
});

describe('DegradedSecurityNoticeProvider — AutoPilot writes', () => {
  it('shows the banner when an autopilot master-toggle PUT returns degraded', async () => {
    renderNotice();
    expect(screen.queryByTestId('degraded-security-notice')).toBeNull();

    triggerDegraded('/api/autopilot/master', 'PUT');

    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
    expect(screen.getByText('Applied — security re-check pending')).toBeTruthy();
  });

  it('shows the banner when an autopilot asset-selector PUT returns degraded', async () => {
    renderNotice();
    triggerDegraded('/api/autopilot/asset', 'PUT');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });

  it('shows the banner when an autopilot bot config PUT returns degraded', async () => {
    renderNotice();
    triggerDegraded('/api/autopilot/bots/scalp-oracle', 'PUT');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });

  it('shows the banner when autopilot logs are cleared (DELETE) in degraded mode', async () => {
    renderNotice();
    triggerDegraded('/api/autopilot/logs', 'DELETE');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });
});

describe('DegradedSecurityNoticeProvider — bot writes', () => {
  it('shows the banner when a bot is deployed (POST /api/bots) in degraded mode', async () => {
    renderNotice();
    triggerDegraded('/api/bots', 'POST');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });

  it('shows the banner when a bot status is toggled (PATCH /api/bots/:id/status) in degraded mode', async () => {
    renderNotice();
    triggerDegraded('/api/bots/some-bot-id/status', 'PATCH');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });
});

describe('DegradedSecurityNoticeProvider — other settings writes', () => {
  it('does not show the banner for a GET to an autopilot route', async () => {
    renderNotice();
    triggerDegraded('/api/autopilot', 'GET');
    await waitFor(() =>
      expect(screen.queryByTestId('degraded-security-notice')).toBeNull(),
    );
  });

  it('does not show the banner for a GET to /api/bots', async () => {
    renderNotice();
    triggerDegraded('/api/bots', 'GET');
    await waitFor(() =>
      expect(screen.queryByTestId('degraded-security-notice')).toBeNull(),
    );
  });

  it('shows the banner for a profile settings write', async () => {
    renderNotice();
    triggerDegraded('/api/profile/settings', 'PUT');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });

  it('shows the banner for broker and MFA settings writes', async () => {
    renderNotice();
    triggerDegraded('/api/broker-sync', 'POST');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
    cleanup();
    renderNotice();
    triggerDegraded('/api/auth/mfa/settings', 'PATCH');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );
  });
});

describe('DegradedSecurityNoticeProvider — dismiss behaviour', () => {
  it('auto-dismisses the notice after 8 seconds', async () => {
    vi.useFakeTimers();
    renderNotice();

    await act(async () => {
      triggerDegraded('/api/autopilot/master', 'PUT');
    });
    expect(screen.getByTestId('degraded-security-notice')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByTestId('degraded-security-notice')).toBeNull();
  });

  it('keeps the banner visible before 8 seconds have elapsed', async () => {
    vi.useFakeTimers();
    renderNotice();

    await act(async () => {
      triggerDegraded('/api/bots', 'POST');
    });
    expect(screen.getByTestId('degraded-security-notice')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(7999);
    });
    expect(screen.getByTestId('degraded-security-notice')).toBeTruthy();
  });

  it('can be manually dismissed before the timer fires', async () => {
    renderNotice();
    triggerDegraded('/api/autopilot/asset', 'PUT');
    await waitFor(() =>
      expect(screen.getByTestId('degraded-security-notice')).toBeTruthy(),
    );

    const notice = screen.getByTestId('degraded-security-notice');
    const dismissBtn = within(notice).getByRole('button', { name: 'Dismiss security notice' });
    fireEvent.click(dismissBtn);

    await waitFor(() =>
      expect(screen.queryByTestId('degraded-security-notice')).toBeNull(),
    );
  });

  it('resets the auto-dismiss timer when a second degraded response arrives', async () => {
    vi.useFakeTimers();
    renderNotice();

    // First degraded response.
    await act(async () => {
      triggerDegraded('/api/autopilot/master', 'PUT');
    });
    expect(screen.getByTestId('degraded-security-notice')).toBeTruthy();

    // 6 seconds later, a second degraded response resets the clock.
    await act(async () => {
      vi.advanceTimersByTime(6000);
      triggerDegraded('/api/bots', 'POST');
    });

    // Banner stays visible at 6 + 7 = 13 s total (timer restarted at t=6 s).
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByTestId('degraded-security-notice')).toBeTruthy();

    // After the reset timer completes (6 + 8 s) it dismisses.
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });
    expect(screen.queryByTestId('degraded-security-notice')).toBeNull();
  });
});

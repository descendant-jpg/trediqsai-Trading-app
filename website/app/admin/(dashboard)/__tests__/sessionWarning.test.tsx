// @vitest-environment jsdom
/**
 * Contract tests for the admin session warning banner.
 *
 * These guard the two failure modes that actually hurt an admin:
 *  - Being dropped out of the CMS mid-edit with no prior warning.
 *  - Being offered a "Stay signed in" button that the server will refuse,
 *    which looks broken and wastes the little time that remains.
 */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionWarningBanner } from '../session-warning';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Shape returned by GET /api/admin/session. */
type SessionPayload = {
  expiresAt: number;
  absoluteExpiresAt: number;
  canExtend: boolean;
};

/** Build a session payload relative to now. */
function session(opts: {
  expiresInMs: number;
  ceilingInMs: number;
}): SessionPayload {
  const now = Date.now();
  return {
    expiresAt: now + opts.expiresInMs,
    absoluteExpiresAt: now + opts.ceilingInMs,
    canExtend: opts.expiresInMs < opts.ceilingInMs,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Install a fetch stub. `sessionPayload` is re-read on every call so a test can
 * change what the server reports partway through.
 */
function stubFetch(handlers: {
  getSession: () => SessionPayload;
  postRefresh?: () => Response;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/admin/refresh') && init?.method === 'POST') {
      return (
        handlers.postRefresh?.() ??
        jsonResponse({ error: 'not stubbed' }, 500)
      );
    }
    if (url.includes('/api/admin/session')) {
      return jsonResponse(handlers.getSession());
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Render and let the initial session fetch settle. */
async function renderBanner() {
  render(<SessionWarningBanner />);
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  // BroadcastChannel is optional in the component; stub it so cross-tab
  // messaging never throws in the test environment.
  if (!('BroadcastChannel' in globalThis)) {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: ((e: MessageEvent) => void) | null = null;
        postMessage() {}
        close() {}
      },
    );
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin session warning banner', () => {
  it('stays out of the way while the session is healthy', async () => {
    stubFetch({
      getSession: () => session({ expiresInMs: 6 * HOUR, ceilingInMs: 20 * HOUR }),
    });

    await renderBanner();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns and offers an extension when the session is expiring but still extendable', async () => {
    stubFetch({
      getSession: () => session({ expiresInMs: 9 * MIN, ceilingInMs: 10 * HOUR }),
    });

    await renderBanner();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Session expiring soon');
    expect(alert.textContent).toContain('9 minutes');

    // The extend action must be available here.
    expect(screen.getByRole('button', { name: /stay signed in/i })).toBeTruthy();
    // ...and the "give up and re-auth" path must NOT be the headline yet.
    expect(alert.textContent).not.toContain('cannot be extended');
  });

  it('warns before the hard deadline and does not offer an extension that would be refused', async () => {
    // At the ceiling: canExtend is false, deadline is 22 minutes out.
    stubFetch({
      getSession: () =>
        session({ expiresInMs: 22 * MIN, ceilingInMs: 22 * MIN }),
    });

    await renderBanner();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('cannot be extended');
    expect(alert.textContent).toContain('22 minutes');

    // This is the regression that matters: never offer an extension the
    // server will reject.
    expect(screen.queryByRole('button', { name: /stay signed in/i })).toBeNull();

    // The admin must be able to get back in from the banner itself.
    const link = screen.getByRole('link', { name: /sign in again/i });
    expect(link.getAttribute('href')).toBe('/admin/login');
  });

  it('warns about the hard deadline earlier than the ordinary expiry warning', async () => {
    // 25 minutes left — outside the 15-minute "expiring soon" window, but
    // inside the 30-minute final window. An extendable session stays quiet
    // here; a session at its ceiling must already be warning.
    stubFetch({
      getSession: () =>
        session({ expiresInMs: 25 * MIN, ceilingInMs: 25 * MIN }),
    });
    await renderBanner();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'cannot be extended',
    );

    cleanup();

    stubFetch({
      getSession: () => session({ expiresInMs: 25 * MIN, ceilingInMs: 12 * HOUR }),
    });
    await renderBanner();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('switches to the final warning when the server refuses an extension', async () => {
    // Starts extendable, so the button is shown; the server then refuses and
    // reports the session is at its ceiling.
    let atCeiling = false;
    stubFetch({
      getSession: () =>
        atCeiling
          ? session({ expiresInMs: 12 * MIN, ceilingInMs: 12 * MIN })
          : session({ expiresInMs: 12 * MIN, ceilingInMs: 30 * HOUR }),
      postRefresh: () => {
        atCeiling = true;
        return jsonResponse(
          {
            error:
              'This session has reached its maximum length. Please sign in again to continue.',
          },
          403,
        );
      },
    });

    await renderBanner();

    const button = await screen.findByRole('button', { name: /stay signed in/i });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('cannot be extended');
    });

    // The refusal is surfaced, the dead button is gone, and re-auth is offered.
    expect(screen.getByRole('alert').textContent).toContain('maximum length');
    expect(screen.queryByRole('button', { name: /stay signed in/i })).toBeNull();
    expect(screen.getByRole('link', { name: /sign in again/i })).toBeTruthy();
  });

  it('hides the banner after a successful extension that still leaves room', async () => {
    let extended = false;
    stubFetch({
      getSession: () =>
        extended
          ? session({ expiresInMs: 8 * HOUR, ceilingInMs: 20 * HOUR })
          : session({ expiresInMs: 10 * MIN, ceilingInMs: 20 * HOUR }),
      postRefresh: () => {
        extended = true;
        const next = session({ expiresInMs: 8 * HOUR, ceilingInMs: 20 * HOUR });
        return jsonResponse({
          ok: true,
          expiresAt: next.expiresAt,
          absoluteExpiresAt: next.absoluteExpiresAt,
        });
      },
    });

    await renderBanner();

    const button = await screen.findByRole('button', { name: /stay signed in/i });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('keeps warning when the last possible extension lands on the ceiling', async () => {
    // The refresh succeeds but exhausts the ceiling: the admin still needs to
    // know they will be signed out, so the banner must not disappear.
    stubFetch({
      getSession: () => session({ expiresInMs: 10 * MIN, ceilingInMs: 25 * MIN }),
      postRefresh: () => {
        const now = Date.now();
        return jsonResponse({
          ok: true,
          expiresAt: now + 25 * MIN,
          absoluteExpiresAt: now + 25 * MIN,
        });
      },
    });

    await renderBanner();

    const button = await screen.findByRole('button', { name: /stay signed in/i });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('cannot be extended');
    });
    expect(screen.queryByRole('button', { name: /stay signed in/i })).toBeNull();
  });

  it('can be dismissed', async () => {
    stubFetch({
      getSession: () => session({ expiresInMs: 9 * MIN, ceilingInMs: 10 * HOUR }),
    });

    await renderBanner();

    const dismiss = await screen.findByRole('button', {
      name: /dismiss session warning/i,
    });
    await act(async () => {
      dismiss.click();
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * Contract tests for the waitlist listing.
 *
 * This page shows real people's email addresses. The failure that matters most
 * is a silent one: Supabase misconfigured or erroring, and the page rendering
 * a confident "0 signups" that makes the team think nobody signed up. It must
 * say it cannot load the data instead.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseServer } = vi.hoisted(() => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock('../../../../../lib/supabase-server', () => ({ getSupabaseServer }));

import WaitlistPage from '../page';

type Row = { id: number; email: string; created_at: string };

/** Stub the Supabase query chain used by the page. */
function stubSupabase(result: { data?: Row[] | null; error?: unknown }) {
  const order = vi.fn(async () => result);
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseServer.mockReturnValue({ from });
  return { from, select, order };
}

/** Render the async server component. */
async function renderPage() {
  render(await WaitlistPage());
}

afterEach(() => {
  cleanup();
  getSupabaseServer.mockReset();
});

describe('waitlist listing', () => {
  it('shows every signup with its email and signup time', async () => {
    stubSupabase({
      data: [
        { id: 2, email: 'second@example.com', created_at: '2026-08-10T12:00:00.000Z' },
        { id: 1, email: 'first@example.com', created_at: '2026-08-09T12:00:00.000Z' },
      ],
    });

    await renderPage();

    expect(screen.getByText('second@example.com')).toBeTruthy();
    expect(screen.getByText('first@example.com')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('asks Supabase for the newest signups first', async () => {
    const { from, select, order } = stubSupabase({ data: [] });

    await renderPage();

    expect(from).toHaveBeenCalledWith('waitlist');
    expect(select).toHaveBeenCalledWith('id, email, created_at');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('says the list is genuinely empty when there are no signups', async () => {
    stubSupabase({ data: [] });

    await renderPage();

    expect(screen.getByText(/no waitlist signups yet/i)).toBeTruthy();
    expect(screen.queryByText(/unavailable right now/i)).toBeNull();
  });

  it('does not pretend there are zero signups when Supabase errors', async () => {
    stubSupabase({ data: null, error: { message: 'permission denied' } });

    await renderPage();

    expect(screen.getByText(/unavailable right now/i)).toBeTruthy();
    // The dangerous regression: an error must never read as "no signups yet".
    expect(screen.queryByText(/no waitlist signups yet/i)).toBeNull();
  });

  it('does not pretend there are zero signups when Supabase is not configured', async () => {
    getSupabaseServer.mockReturnValue(null);

    await renderPage();

    expect(screen.getByText(/unavailable right now/i)).toBeTruthy();
    expect(screen.queryByText(/no waitlist signups yet/i)).toBeNull();
  });

  it('does not crash the CMS when the query throws', async () => {
    getSupabaseServer.mockImplementation(() => {
      throw new Error('network down');
    });

    await renderPage();

    expect(screen.getByText(/unavailable right now/i)).toBeTruthy();
  });

  it('survives a signup row with an unreadable date', async () => {
    stubSupabase({
      data: [{ id: 1, email: 'someone@example.com', created_at: 'not-a-date' }],
    });

    await renderPage();

    expect(screen.getByText('someone@example.com')).toBeTruthy();
    expect(screen.getByText(/unknown date/i)).toBeTruthy();
  });
});

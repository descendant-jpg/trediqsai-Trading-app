// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WaitlistPage from '../page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('waitlist lead manager', () => {
  it('shows API entries and filters them by name or email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ entries: [
      { id: '1', name: 'Ava Trader', email: 'ava@example.com', created_at: '2026-08-15T12:00:00Z' },
      { id: '2', name: 'Ben', email: 'ben@example.com', created_at: '2026-08-15T12:00:00Z' },
    ] })));
    render(<WaitlistPage />);
    expect(await screen.findByText('ava@example.com')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/search name or email/i), { target: { value: 'ben@' } });
    await waitFor(() => expect(screen.queryByText('ava@example.com')).toBeNull());
    expect(screen.getByText('ben@example.com')).toBeTruthy();
  });

  it('shows a safe error when the lead API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Database service is not configured.' }, 503)));
    render(<WaitlistPage />);
    expect(await screen.findByText(/database service is not configured/i)).toBeTruthy();
  });

  it('loads records beyond the first API page so they can be searched', async () => {
    const first = Array.from({ length: 200 }, (_, index) => ({ id: String(index), name: `Lead ${index}`, email: `lead${index}@example.com`, created_at: '2026-08-15T12:00:00Z' }));
    const finalLead = { id: '201', name: 'Final Lead', email: 'beyond-first-page@example.com', created_at: '2026-08-15T12:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => response(String(input).includes('page=2') ? { entries: [finalLead], total: 201 } : { entries: first, total: 201 })));
    render(<WaitlistPage />);
    expect(await screen.findByText('beyond-first-page@example.com')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/search name or email/i), { target: { value: 'beyond-first-page' } });
    expect(screen.getByText('beyond-first-page@example.com')).toBeTruthy();
  });
});
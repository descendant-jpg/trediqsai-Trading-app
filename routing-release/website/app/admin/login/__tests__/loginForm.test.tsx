// @vitest-environment jsdom
/**
 * Contract tests for the admin sign-in form.
 *
 * A sign-in screen that fails silently is indistinguishable from a broken
 * site: the admin types the right password, nothing happens, and they have no
 * idea whether the server is down, the password is wrong, or they are locked
 * out. These lock down that every outcome says something.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { replace, refresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

import { LoginForm } from '../login-form';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Type an authorized email, a password, and submit the form. */
async function signIn(password: string) {
  fireEvent.change(screen.getByLabelText(/administrator email/i), { target: { value: 'nextgensynthex@gmail.com' } });
  const input = screen.getByLabelText(/password/i);
  fireEvent.change(input, { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  });
}

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('admin sign-in form', () => {
  it('cannot be submitted empty', () => {
    render(<LoginForm />);
    const button = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('sends the admin to the CMS after a correct password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));

    render(<LoginForm />);
    await signIn('correct-horse');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText(/unable to sign in/i)).toBeNull();
  });

  it('returns the admin to the page they originally wanted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));

    render(<LoginForm next="/admin/waitlist" />);
    await signIn('correct-horse');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/waitlist'));
  });

  it('refuses to be redirected off the admin area after sign-in', async () => {
    // A crafted ?next= must not turn the sign-in screen into an open redirect.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));

    render(<LoginForm next="https://evil.example/steal" />);
    await signIn('correct-horse');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    expect(replace).not.toHaveBeenCalledWith('https://evil.example/steal');
  });

  it('says so when the password is wrong, and lets the admin try again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Incorrect password.' }, 401)),
    );

    render(<LoginForm />);
    await signIn('wrong');

    expect(await screen.findByText('Incorrect password.')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    // The form must not stay stuck in its "Signing in…" state.
    const retry = screen.getByRole('button', { name: /^sign in$/i }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });

  it('tells the admin when they are locked out for too many attempts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'Too many attempts. Please try again later.' }, 429),
      ),
    );

    render(<LoginForm />);
    await signIn('wrong-again');

    expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('tells the admin when the server has no password configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'Admin access is not configured on this server.' }, 503),
      ),
    );

    render(<LoginForm />);
    await signIn('anything');

    expect(await screen.findByText(/not configured/i)).toBeTruthy();
  });

  it('does not fail silently when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    render(<LoginForm />);
    await signIn('correct-horse');

    expect(await screen.findByText(/unable to sign in/i)).toBeTruthy();
    const retry = screen.getByRole('button', { name: /^sign in$/i }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });

  it('announces errors to screen readers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Incorrect password.' }, 401)),
    );

    render(<LoginForm />);
    await signIn('wrong');

    const message = await screen.findByText('Incorrect password.');
    expect(message.getAttribute('aria-live')).toBe('polite');
  });
});

/**
 * Contract tests for admin session tokens.
 *
 * The banner can only warn correctly if the server reports the session
 * honestly. These lock down the rules the banner depends on:
 *  - a session can be slid forward, but never past its ceiling
 *  - the ceiling is measured from the original sign-in and survives refreshes
 *  - once the ceiling is reached, refreshing is refused rather than silently
 *    returning an unchanged session
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSessionToken,
  getMaxSessionLifetimeMs,
  isValidSessionToken,
  readSessionToken,
  refreshSessionToken,
} from '../admin-auth';

const HOUR = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.ADMIN_PASSWORD = 'test-password';
  delete process.env.ADMIN_SESSION_MAX_HOURS;
});

afterEach(() => {
  delete process.env.ADMIN_SESSION_MAX_HOURS;
});

/** Create a token and assert it was issued (keeps the tests readable). */
async function freshToken(now = T0): Promise<string> {
  const token = await createSessionToken(now);
  expect(token).not.toBeNull();
  return token as string;
}

describe('admin session tokens', () => {
  it('issues a session with a ceiling measured from sign-in', async () => {
    const session = await readSessionToken(await freshToken(), T0);

    expect(session).not.toBeNull();
    expect(session!.issuedAt).toBe(T0);
    expect(session!.expiresAt).toBe(T0 + 12 * HOUR);
    expect(session!.absoluteExpiresAt).toBe(T0 + 24 * HOUR);
  });

  it('slides a session forward while there is room under the ceiling', async () => {
    const result = await refreshSessionToken(await freshToken(), T0 + 11 * HOUR);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.session.expiresAt).toBe(T0 + 23 * HOUR);
    // The ceiling must not move with the refresh.
    expect(result.session.issuedAt).toBe(T0);
    expect(result.session.absoluteExpiresAt).toBe(T0 + 24 * HOUR);
  });

  it('clamps the last extension to the ceiling instead of overshooting', async () => {
    const first = await refreshSessionToken(await freshToken(), T0 + 11 * HOUR);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;

    // 12 more hours would land at 32h; the ceiling is 24h.
    const second = await refreshSessionToken(first.token, T0 + 20 * HOUR);
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.session.expiresAt).toBe(T0 + 24 * HOUR);
  });

  it('refuses to refresh once the ceiling is reached', async () => {
    // Slide forward twice: the second refresh lands exactly on the ceiling.
    const first = await refreshSessionToken(await freshToken(), T0 + 11 * HOUR);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;

    const second = await refreshSessionToken(first.token, T0 + 20 * HOUR);
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.session.expiresAt).toBe(T0 + 24 * HOUR);

    // Nothing left to give.
    const atCeiling = await refreshSessionToken(second.token, T0 + 23 * HOUR);
    expect(atCeiling.status).toBe('ceiling_reached');
  });

  it('cannot be held open indefinitely by repeated refreshes', async () => {
    let token = await freshToken();
    // Refresh every 6 minutes for a simulated day.
    for (let i = 1; i <= 240; i += 1) {
      const result = await refreshSessionToken(token, T0 + i * 6 * 60 * 1000);
      if (result.status === 'ok') token = result.token;
    }

    const session = await readSessionToken(token, T0 + 23 * HOUR);
    expect(session).not.toBeNull();
    expect(session!.expiresAt).toBeLessThanOrEqual(T0 + 24 * HOUR);

    // Past the ceiling the session is simply gone.
    expect(await isValidSessionToken(token, T0 + 24 * HOUR + 1)).toBe(false);
    expect((await refreshSessionToken(token, T0 + 25 * HOUR)).status).toBe(
      'unauthenticated',
    );
  });

  it('signs everyone out when the session secret is rotated', async () => {
    const token = await freshToken();
    expect(await isValidSessionToken(token, T0 + HOUR)).toBe(true);

    process.env.SESSION_SECRET = 'rotated-secret';

    expect(await isValidSessionToken(token, T0 + HOUR)).toBe(false);
    expect((await refreshSessionToken(token, T0 + HOUR)).status).toBe(
      'unauthenticated',
    );
  });

  it('rejects tampered, legacy, and malformed tokens', async () => {
    const signature = (await freshToken()).split('.')[2];

    // Backdating the sign-in to win a longer ceiling.
    expect(
      await isValidSessionToken(
        `${T0 - 100 * HOUR}.${T0 + 12 * HOUR}.${signature}`,
        T0,
      ),
    ).toBe(false);
    // Pushing the expiry far into the future.
    expect(
      await isValidSessionToken(`${T0}.${T0 + 999 * HOUR}.${signature}`, T0),
    ).toBe(false);
    // Pre-ceiling two-part tokens carry no sign-in time, so they must re-auth.
    expect(
      await isValidSessionToken(`${T0 + 12 * HOUR}.${signature}`, T0),
    ).toBe(false);
    expect(await isValidSessionToken('garbage', T0)).toBe(false);
    expect(await isValidSessionToken(undefined, T0)).toBe(false);
  });

  it('honours a configured ceiling and falls back safely', async () => {
    process.env.ADMIN_SESSION_MAX_HOURS = '36';
    expect(getMaxSessionLifetimeMs()).toBe(36 * HOUR);

    // Never shorter than one sliding period, or a fresh login would be unusable.
    process.env.ADMIN_SESSION_MAX_HOURS = '1';
    expect(getMaxSessionLifetimeMs()).toBe(12 * HOUR);

    process.env.ADMIN_SESSION_MAX_HOURS = 'nonsense';
    expect(getMaxSessionLifetimeMs()).toBe(24 * HOUR);
  });
});

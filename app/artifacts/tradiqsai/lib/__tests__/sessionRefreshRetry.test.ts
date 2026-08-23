// Session-expiry recovery: a 401 from the API forces one token refresh and
// retries the request; persistent 401s invoke the auth failure handler
// (which the app wires to supabase.auth.signOut → auth screen).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  customFetch,
  setAuthFailureHandler,
  setAuthSessionRefresher,
  setAuthTokenGetter,
  ApiError,
} from '@workspace/api-client-react';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('customFetch 401 recovery', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    setAuthTokenGetter(() => 'stale-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAuthTokenGetter(null);
    setAuthSessionRefresher(null);
    setAuthFailureHandler(null);
  });

  it('refreshes the session and retries once on 401', async () => {
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    setAuthSessionRefresher(refresher);
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await customFetch('/api/autopilot');

    expect(result).toEqual({ ok: true });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('authorization')).toBe('Bearer fresh-token');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('invokes the auth failure handler when the retry still 401s', async () => {
    setAuthSessionRefresher(vi.fn().mockResolvedValue('fresh-token'));
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    fetchMock.mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    await expect(customFetch('/api/autopilot')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('invokes the auth failure handler when the refresh itself fails', async () => {
    setAuthSessionRefresher(vi.fn().mockResolvedValue(null));
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    fetchMock.mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    await expect(customFetch('/api/autopilot')).rejects.toBeInstanceOf(ApiError);
    // No retry without a fresh token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('keeps persistent 401s inline without auth side effects when suppressed', async () => {
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    setAuthSessionRefresher(refresher);
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    fetchMock.mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    await expect(
      customFetch('/api/admin/dashboard', { suppressAuthFailure: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresher).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does not retry when no refresher is registered', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    await expect(customFetch('/api/autopilot')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

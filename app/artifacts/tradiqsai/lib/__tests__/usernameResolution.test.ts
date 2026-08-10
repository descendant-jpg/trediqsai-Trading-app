import { describe, expect, it, vi } from 'vitest';
import {
  resolveUsername,
  type UsernameResolutionDeps,
  type UsernameState,
} from '../usernameResolution';

/**
 * Test harness: tracks username state like React's setState (with functional
 * updates), records every applied value, and provides overridable deps.
 */
function makeHarness(overrides: Partial<UsernameResolutionDeps> = {}) {
  let state: UsernameState = undefined;
  const applied: UsernameState[] = [];
  const stored: string[] = [];
  const warnings: string[] = [];

  const deps: UsernameResolutionDeps = {
    consumePendingSignupUsername: () => null,
    getStoredUsername: async () => null,
    storeUsername: (name) => {
      stored.push(name);
    },
    fetchRemoteUsername: async () => ({ username: null }),
    setUsername: (update) => {
      state = typeof update === 'function' ? update(state) : update;
      applied.push(state);
    },
    isCancelled: () => false,
    warn: (m) => {
      warnings.push(m);
    },
    ...overrides,
  };

  return {
    deps,
    stored,
    warnings,
    applied,
    get state() {
      return state;
    },
    set state(v: UsernameState) {
      state = v;
    },
  };
}

describe('resolveUsername', () => {
  it('staged signup username wins immediately, before any async lookup', async () => {
    let remoteResolve!: (v: { username: string | null }) => void;
    const h = makeHarness({
      consumePendingSignupUsername: () => 'trader_max',
      // Profile row hasn't committed yet — never resolves during assertion.
      fetchRemoteUsername: () =>
        new Promise((resolve) => {
          remoteResolve = resolve;
        }),
    });

    const done = resolveUsername(h.deps);
    // Synchronously applied — no window for the prompt to flash.
    expect(h.applied[0]).toBe('trader_max');
    // And persisted locally right away.
    expect(h.stored).toContain('trader_max');

    // Let resolution reach the (still pending) remote fetch, then resolve it.
    await new Promise((r) => setTimeout(r, 0));
    remoteResolve({ username: null });
    await done;
    // Missing profile row never downgrades the staged username.
    expect(h.state).toBe('trader_max');
  });

  it('staged username is consumed exactly once', async () => {
    let calls = 0;
    const h = makeHarness({
      consumePendingSignupUsername: () => {
        calls += 1;
        return calls === 1 ? 'once_only' : null;
      },
    });
    await resolveUsername(h.deps);
    expect(calls).toBe(1);
    expect(h.state).toBe('once_only');
  });

  it('local claimed record wins over a missing profile row', async () => {
    const h = makeHarness({
      getStoredUsername: async () => 'claimed_locally',
      fetchRemoteUsername: async () => ({ username: null }), // stale/missing row
    });
    await resolveUsername(h.deps);
    expect(h.state).toBe('claimed_locally');
    // Never transitioned through null (which would show the prompt).
    expect(h.applied).not.toContain(null);
  });

  it('remote username syncs to local storage', async () => {
    const h = makeHarness({
      fetchRemoteUsername: async () => ({ username: 'from_server' }),
    });
    await resolveUsername(h.deps);
    expect(h.state).toBe('from_server');
    expect(h.stored).toContain('from_server');
  });

  it('remote username overrides an older local record and re-syncs it', async () => {
    const h = makeHarness({
      getStoredUsername: async () => 'old_local',
      fetchRemoteUsername: async () => ({ username: 'renamed_remote' }),
    });
    await resolveUsername(h.deps);
    expect(h.state).toBe('renamed_remote');
    expect(h.stored).toContain('renamed_remote');
  });

  it('a lookup error never downgrades a locally known username', async () => {
    const h = makeHarness({
      getStoredUsername: async () => 'known_user',
      fetchRemoteUsername: async () => ({ error: 'network down' }),
    });
    await resolveUsername(h.deps);
    expect(h.state).toBe('known_user');
    expect(h.applied).not.toContain(null);
    expect(h.applied).not.toContain(undefined);
    expect(h.warnings.some((w) => w.includes('network down'))).toBe(true);
  });

  it('a lookup error with no local record leaves state undetermined (no prompt)', async () => {
    const h = makeHarness({
      fetchRemoteUsername: async () => ({ error: 'boom' }),
    });
    await resolveUsername(h.deps);
    // undefined = unknown, which does NOT trigger the prompt (null would).
    expect(h.state).toBeUndefined();
    expect(h.applied).not.toContain(null);
  });

  it('missing row with a username already set in state never downgrades to null', async () => {
    const h = makeHarness();
    // e.g. setUsernameClaimed ran while the fetch was in flight.
    h.state = 'claimed_meanwhile';
    await resolveUsername(h.deps);
    expect(h.state).toBe('claimed_meanwhile');
  });

  it('only a truly unclaimed profile (no local record, no row) prompts with null', async () => {
    const h = makeHarness();
    await resolveUsername(h.deps);
    expect(h.state).toBeNull();
  });

  it('storage read failure falls through to the server lookup', async () => {
    const h = makeHarness({
      getStoredUsername: async () => {
        throw new Error('storage unavailable');
      },
      fetchRemoteUsername: async () => ({ username: 'from_server' }),
    });
    await resolveUsername(h.deps);
    expect(h.state).toBe('from_server');
  });

  it('applies no updates after cancellation', async () => {
    let cancelled = false;
    const setUsername = vi.fn();
    const h = makeHarness({
      setUsername,
      isCancelled: () => cancelled,
      getStoredUsername: async () => {
        cancelled = true; // effect cleaned up mid-flight
        return 'stale_user';
      },
    });
    await resolveUsername(h.deps);
    expect(setUsername).not.toHaveBeenCalled();
  });
});

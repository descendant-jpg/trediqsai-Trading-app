import { describe, expect, it } from 'vitest';
import { canAccessTool } from '../aiToolAccess';

describe('canAccessTool', () => {
  it('allows Starter features for every user tier', () => {
    expect(canAccessTool('starter', 'starter', false)).toBe(true);
  });

  it('requires Pro access for Pro features', () => {
    expect(canAccessTool('pro', 'starter', false)).toBe(false);
    expect(canAccessTool('pro', 'pro', false)).toBe(true);
  });

  it('reserves Elite features for Elite access', () => {
    expect(canAccessTool('elite', 'pro', false)).toBe(false);
    expect(canAccessTool('elite', 'elite', false)).toBe(true);
  });

  it('unlocks every tool for verified admins', () => {
    expect(canAccessTool('elite', 'starter', true)).toBe(true);
  });
});
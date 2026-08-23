import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AdminDashboard Home navigation', () => {
  it('replaces the Admin stack with the Home tab route', () => {
    const dashboard = readFileSync(
      resolve(process.cwd(), 'app/(admin)/index.tsx'),
      'utf8',
    );

    expect(dashboard).toContain('router.replace("/(tabs)" as never)');
    expect(dashboard).not.toContain('router.navigate("/(tabs)/profile")');
  });
});
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('mobile admin route isolation', () => {
  it('uses an independently guarded stack instead of the user tab navigator', () => {
    const adminLayout = read('app/(admin)/_layout.tsx');

    expect(adminLayout).toContain("import { Redirect, Stack } from 'expo-router'");
    expect(adminLayout).toContain('if (!isGodAdmin)');
    expect(adminLayout).toContain('<Redirect href="/(tabs)"');
    expect(adminLayout).not.toContain('<Tabs');
  });

  it('exposes the admin tab only for the exact server-validated role state', () => {
    const tabLayout = read('app/(tabs)/_layout.tsx');

    expect(tabLayout).toContain("href: isGodAdmin ? '/admin' : null");
  });
});
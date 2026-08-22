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
    expect(adminLayout).toContain('const { session, loading } = useAuth()');
    expect(adminLayout).toContain('if (!session) return <Redirect href="/(tabs)" />;');
    expect(adminLayout).not.toContain('isGodAdmin');
    expect(adminLayout).not.toContain('<Tabs');
  });

  it('keeps the footer limited to the five trader navigation destinations', () => {
    const tabLayout = read('app/(tabs)/_layout.tsx');

    for (const tabName of ['index', 'tradiqsai', 'ai-tools', 'signals', 'profile']) {
      expect(tabLayout).toContain(`name="${tabName}"`);
    }
    expect(tabLayout).not.toContain('admin-entry');
    expect(tabLayout).not.toContain("title: 'Admin'");
  });

  it('shows the admin entry only from Profile for the exact server-validated role', () => {
    const profileScreen = read('app/(tabs)/profile.tsx');

    expect(profileScreen).toContain('const { session, signOut, startAccountCreation } = useAuth()');
    expect(profileScreen).toContain('{role === "god_admin" && (');
    expect(profileScreen).not.toContain('nextgensynthex@gmail.com');
    expect(profileScreen).toContain('testID="profile-admin-command-center"');
    expect(profileScreen).toContain('Haptics.ImpactFeedbackStyle.Heavy');
    expect(profileScreen).toContain('router.push("/(admin)" as never)');
  });
});
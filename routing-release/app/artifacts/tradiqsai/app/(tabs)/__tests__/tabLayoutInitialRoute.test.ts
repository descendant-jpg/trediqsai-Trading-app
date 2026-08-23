import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tabLayout = readFileSync(resolve(process.cwd(), 'app/(tabs)/_layout.tsx'), 'utf8');

describe('tab layout default route', () => {
  it('opens the Home tab before every other visible tab', () => {
    expect(tabLayout).toContain('initialRouteName="index"');
    expect(tabLayout.indexOf('name="index"')).toBeLessThan(tabLayout.indexOf('name="profile"'));
  });
});
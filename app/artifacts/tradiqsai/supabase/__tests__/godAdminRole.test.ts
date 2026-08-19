import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(__dirname, '..', 'migrations', '024_god_admin_role.sql'),
  'utf8',
);
const consolidated = readFileSync(
  join(__dirname, '..', 'APPLY_TO_SUPABASE.sql'),
  'utf8',
);

describe('god_admin role schema', () => {
  it('permits the exact privileged role without changing any account', () => {
    expect(migration).toContain("check (role in ('user', 'admin', 'god_admin'))");
    expect(migration).not.toMatch(/\bupdate\s+public\.profiles\b/i);
  });

  it('leaves god_admin enabled in the final consolidated constraint', () => {
    const finalRoleConstraint = consolidated.lastIndexOf(
      "check (role in ('user', 'admin', 'god_admin'))",
    );
    const legacyConstraint = consolidated.lastIndexOf(
      "check (role in ('user', 'admin'))",
    );

    expect(finalRoleConstraint).toBeGreaterThan(legacyConstraint);
  });
});
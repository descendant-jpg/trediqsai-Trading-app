import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Payout guardrails live in SQL, and this environment applies migrations by
 * hand — so nothing else in CI can catch a regression here before real money
 * moves. These tests read the migration text and assert the properties that
 * make forged trades unprofitable:
 *
 *   1. Payout maths must never read `profiles.balance`. Authenticated users
 *      can write their own `trades` rows via PostgREST, and the P&L trigger
 *      settles those client-chosen prices into the balance. Deriving payouts
 *      from it is the exact fraud path this migration closes.
 *   2. Only trades stamped `price_source = 'SERVER'` (priced by the server
 *      inside the guarded RPCs) may count toward profit or active days.
 *   3. The trusted-price flag must not be settable by a client write.
 *
 * They are text assertions, not a live database — a Supabase-backed
 * integration test is tracked separately.
 *
 * Migrations are immutable once applied, so a guardrail can be *replaced* by a
 * later file. These tests therefore resolve each function from the LAST
 * migration that defines it, which is what a database ends up running after
 * applying them in order. Asserting against one hardcoded file would pass
 * while the deployed definition says something else.
 */

const migrationsDir = join(__dirname, '..', 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(migrationsDir, name), 'utf8') }));

/** Every migration concatenated in apply order. */
const sql = migrations.map((m) => m.text).join('\n');

/**
 * Body of the FINAL `create or replace function <name>` definition across all
 * migrations — i.e. the definition a migrated database actually ends up with.
 */
function functionBody(name: string, implementationClue?: string): string {
  const needle = `create or replace function public.${name}(`;
  const owner = [...migrations]
    .reverse()
    .find((m) => m.text.includes(needle) && (!implementationClue || m.text.includes(implementationClue)));
  expect(owner, `${name} should be defined in some migration`).toBeDefined();
  const text = owner!.text;
  const start = text.lastIndexOf(needle);
  const end = text.indexOf('$$;', start);
  expect(end, `${name} should be terminated`).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('migration hygiene', () => {
  it('ships payout corrections as a later migration, not by editing 014', () => {
    // 014 is already applied in live projects, so a database that recorded it
    // never reruns it. Corrections must arrive in their own forward file or
    // they silently do not reach production.
    const settled = migrations.find((m) =>
      m.text.includes("count(distinct (t.closed_at at time zone 'UTC')::date)"),
    );
    expect(settled, 'a migration should define settlement-based active days').toBeDefined();
    expect(settled!.name > '014_payout_evaluation_guardrails.sql').toBe(true);

    const original = migrations.find(
      (m) => m.name === '014_payout_evaluation_guardrails.sql',
    );
    expect(original!.text).toContain('cashout := least(virtual_profit * split');
  });

  it('adds settlement timestamps before the corrected payout index references them', () => {
    const settled = migrations.find((m) => m.name === '015_payout_settlement_and_reservation.sql');
    expect(settled).toBeDefined();

    const closedAtColumn = settled!.text.indexOf('add column if not exists closed_at timestamptz');
    const settledIndex = settled!.text.indexOf('create index if not exists trades_verified_settled_days_idx');
    expect(closedAtColumn).toBeGreaterThan(-1);
    expect(closedAtColumn).toBeLessThan(settledIndex);
  });
});

describe('payout evaluation ledger', () => {
  // Later migrations add auth wrappers which delegate to this latest
  // calculation implementation; assertions below target the delegated ledger.
  const summary = functionBody('payout_evaluation_summary', 'total_equity :=');

  it('never derives payout figures from the client-movable balance', () => {
    // profiles.balance is moved by client-priced trades, so the payout maths
    // must not read it. (account_status/tier columns are still fine.)
    expect(summary).not.toMatch(/profile_row\.balance/);
    expect(summary).not.toMatch(/profile_row\.daily_starting_balance/);
  });

  it('computes equity from the $10,000 start plus verified realized P&L', () => {
    expect(summary).toMatch(/total_equity\s*:=\s*10000\s*\+\s*verified_pnl/);
  });

  it('counts only server-priced, closed and settled trades toward active days', () => {
    const serverOnly = summary.match(/price_source\s*=\s*'SERVER'/g) ?? [];
    // verified realized P&L, today's P&L, and the active-day count.
    expect(serverOnly.length).toBeGreaterThanOrEqual(3);

    const activeDays = summary.slice(
      summary.indexOf('-- An active day is credited'),
      summary.indexOf('into paid'),
    );
    expect(activeDays).toMatch(/price_source\s*=\s*'SERVER'/);
    expect(activeDays).toMatch(/status\s*=\s*'CLOSED'/);
    expect(activeDays).toMatch(/closed_at is not null/);
    expect(activeDays).toMatch(/closed_at\s*>=\s*cycle::timestamptz/);
    expect(activeDays).toMatch(/count\(distinct \(t\.closed_at at time zone 'UTC'\)::date\)/);
    expect(activeDays).not.toMatch(/created_at at time zone/);
  });

  it('keeps the monthly cap and split server-side per plan', () => {
    expect(summary).toMatch(/split\s*:=\s*0\.10;[\s\S]*?cap\s*:=\s*500;/);
    expect(summary).toMatch(/split\s*:=\s*0\.05;[\s\S]*?cap\s*:=\s*250;/);
    // Paid reservations come off the already-capped earned entitlement, not
    // only the cap. This prevents the same profit being requested repeatedly.
    expect(summary).toMatch(
      /cashout\s*:=\s*greatest\(0,\s*least\(virtual_profit\s*\*\s*split,\s*cap\)\s*-\s*paid\)/,
    );
  });

  it('requires six active days and latches drawdown violations for the cycle', () => {
    expect(summary).toMatch(/active_days\s*<\s*6/);
    expect(summary).toMatch(/daily_loss\s*>\s*500/);
    expect(summary).toMatch(/total_equity\s*<\s*9000/);
    // A latched violation wins over any later recovery.
    expect(summary).toMatch(/coalesce\(public\.payout_evaluation_cycles\.violated_at/);
  });

  it('rejects free accounts before computing any payable amount', () => {
    expect(summary).toMatch(/An active Pro or Elite plan is required for payouts/);
  });
});

describe('payout request', () => {
  const request = functionBody('request_evaluation_payout', 'pg_advisory_xact_lock');
  const summary = functionBody('payout_evaluation_summary', 'total_equity :=');

  it('recomputes eligibility under a per-user lock before reserving', () => {
    const lockAt = request.indexOf('pg_advisory_xact_lock');
    const summaryAt = request.indexOf('public.payout_evaluation_summary()');
    const insertAt = request.indexOf('insert into public.payout_requests');
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(summaryAt);
    expect(summaryAt).toBeLessThan(insertAt);
  });

  it('locks existing cycle reservations after the zero-row-safe advisory lock', () => {
    const advisoryAt = request.indexOf('pg_advisory_xact_lock');
    const reservationLockAt = request.indexOf('from public.payout_requests');
    const summaryAt = request.indexOf('public.payout_evaluation_summary()');
    expect(reservationLockAt).toBeGreaterThan(advisoryAt);
    expect(request.slice(reservationLockAt, summaryAt)).toMatch(/for update/);
  });

  it('locks evaluation status and monthly totals before calculating eligibility', () => {
    expect(summary).toMatch(/from public\.profiles[\s\S]*?where id = caller for update/);
    const cycleSelect = summary.slice(summary.indexOf('select * into cycle_row'), summary.indexOf('-- The cycle row is locked'));
    expect(cycleSelect).toMatch(/from public\.payout_evaluation_cycles[\s\S]*?for update/);
    const reservationLockAt = request.indexOf('from public.payout_requests');
    const summaryAt = request.indexOf('public.payout_evaluation_summary()');
    const insertAt = request.indexOf('insert into public.payout_requests');
    expect(reservationLockAt).toBeLessThan(summaryAt);
    expect(summaryAt).toBeLessThan(insertAt);
    expect(request).toMatch(/pg_advisory_xact_lock/);
  });

  it('refuses to insert when the recomputed summary is not eligible', () => {
    expect(request).toMatch(/if not coalesce\(\(summary ->> 'eligible'\)::boolean, false\) then[\s\S]*?raise exception/);
  });
});

describe('trade price provenance', () => {
  const trigger = functionBody('compute_trade_pnl');

  it('stamps client writes as CLIENT and only trusts the transaction flag', () => {
    expect(trigger).toMatch(/current_setting\('app\.trusted_trade', true\)/);
    expect(trigger).toMatch(/case when trusted then 'SERVER' else 'CLIENT' end/);
  });

  it('never upgrades provenance on update', () => {
    // A client-opened trade closed through the RPC must stay CLIENT.
    expect(trigger).toMatch(
      /new\.price_source\s*:=\s*case\s*\n\s*when old\.price_source = 'SERVER' and trusted then 'SERVER'\s*\n\s*else 'CLIENT'/,
    );
  });

  it('defaults the column to CLIENT so unstamped rows cannot pay out', () => {
    expect(sql).toMatch(/add column if not exists price_source text not null default 'CLIENT'/);
  });

  it('prices guarded trades from the server-owned feed, not from arguments', () => {
    const open = functionBody('open_server_trade');
    const close = functionBody('close_server_trade');
    expect(open).toMatch(/v_price\s*:=\s*public\.trusted_market_price\(p_asset\)/);
    expect(close).toMatch(/v_price\s*:=\s*public\.trusted_market_price\(v_row\.asset\)/);
    // No price parameter is accepted from the caller.
    expect(sql).not.toMatch(/create or replace function public\.open_server_trade\([^)]*p_entry_price/);
    expect(sql).not.toMatch(/create or replace function public\.close_server_trade\([^)]*p_close_price/);
  });

  it('rejects a stale reference price instead of falling back', () => {
    const trusted = functionBody('trusted_market_price');
    expect(trusted).toMatch(/updated_at > now\(\) - interval '2 minutes'/);
    expect(trusted).toMatch(/raise exception 'No live server price/);
  });
});

describe('market price table', () => {
  it('is readable but never writable by app clients', () => {
    expect(sql).toMatch(/revoke all on public\.market_prices from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.market_prices to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update).*on public\.market_prices to authenticated/);
  });
});

describe('liquidation', () => {
  it('keeps verified losses in the payout ledger and stays service-role only', () => {
    const liquidate = functionBody('liquidate_account');
    expect(liquidate).toMatch(/set_config\('app\.trusted_trade', 'on', true\)/);
    expect(sql).toMatch(
      /revoke execute on function public\.liquidate_account\(uuid, numeric\) from public, anon, authenticated/,
    );
  });
});

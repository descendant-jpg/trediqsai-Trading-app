import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
 */

const sqlPath = join(
  __dirname,
  '..',
  'migrations',
  '014_payout_evaluation_guardrails.sql',
);
const sql = readFileSync(sqlPath, 'utf8');

/** Body of a `create or replace function <name>` block, up to its `$$;` end. */
function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} should be defined in the migration`).toBeGreaterThan(-1);
  const end = sql.indexOf('\n$$;', start);
  expect(end, `${name} should be terminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('payout evaluation ledger', () => {
  const summary = functionBody('payout_evaluation_summary');

  it('never derives payout figures from the client-movable balance', () => {
    // profiles.balance is moved by client-priced trades, so the payout maths
    // must not read it. (account_status/tier columns are still fine.)
    expect(summary).not.toMatch(/profile_row\.balance/);
    expect(summary).not.toMatch(/profile_row\.daily_starting_balance/);
  });

  it('computes equity from the $10,000 start plus verified realized P&L', () => {
    expect(summary).toMatch(/total_equity\s*:=\s*10000\s*\+\s*verified_pnl/);
  });

  it('counts only server-priced trades toward profit, daily loss and active days', () => {
    const serverOnly = summary.match(/price_source\s*=\s*'SERVER'/g) ?? [];
    // verified realized P&L, today's P&L, and the active-day count.
    expect(serverOnly.length).toBeGreaterThanOrEqual(3);

    const activeDays = summary.slice(
      summary.indexOf('into active_days'),
      summary.indexOf('into paid'),
    );
    expect(activeDays).toMatch(/price_source\s*=\s*'SERVER'/);
  });

  it('keeps the monthly cap and split server-side per plan', () => {
    expect(summary).toMatch(/split\s*:=\s*0\.10;[\s\S]*?cap\s*:=\s*500;/);
    expect(summary).toMatch(/split\s*:=\s*0\.05;[\s\S]*?cap\s*:=\s*250;/);
    expect(summary).toMatch(/cashout\s*:=\s*least\(\s*virtual_profit\s*\*\s*split,\s*greatest\(0,\s*cap\s*-\s*paid\)/);
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
  const request = functionBody('request_evaluation_payout');

  it('recomputes eligibility under a per-user lock before reserving', () => {
    const lockAt = request.indexOf('pg_advisory_xact_lock');
    const summaryAt = request.indexOf('public.payout_evaluation_summary()');
    const insertAt = request.indexOf('insert into public.payout_requests');
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(summaryAt);
    expect(summaryAt).toBeLessThan(insertAt);
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

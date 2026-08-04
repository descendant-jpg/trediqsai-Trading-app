-- TradiQs AI — drawdown monitoring schema: profiles, balance settlement,
-- liquidation RPC, and pg_cron scheduling.
-- Run AFTER trades.sql in the Supabase SQL editor.

-- ── 1. Profiles table (auth.users cannot be altered directly) ────────
-- Holds the account state the drawdown monitor needs.
create table if not exists public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  balance                numeric not null default 10000,
  daily_starting_balance numeric not null default 10000,
  account_status         text    not null default 'ACTIVE'
                         check (account_status in ('ACTIVE', 'BLOWN')),
  updated_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- No insert/update policies for clients: balances and status are
-- server-owned (triggers + service role only).

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ── 2. Settle realized P&L into the balance when a trade closes ──────
create or replace function public.apply_pnl_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'CLOSED' and old.status = 'OPEN' and new.pnl is not null then
    update public.profiles
      set balance = balance + new.pnl,
          updated_at = now()
      where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trades_apply_pnl on public.trades;
create trigger trades_apply_pnl
  after update on public.trades
  for each row execute function public.apply_pnl_to_balance();

-- ── 3. Atomic liquidation RPC (called by the drawdown-monitor function) ──
-- Re-validates the drawdown breach INSIDE the transaction (row-locking the
-- profile and open trades first), so a stale read in the edge function can
-- never falsely liquidate an account whose equity recovered or whose trades
-- were closed in the meantime. Returns true if the account was liquidated.
create or replace function public.liquidate_account(
  p_user_id     uuid,
  p_close_price numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile        public.profiles%rowtype;
  v_unrealized_pnl numeric;
begin
  if p_close_price is null or p_close_price <= 0 then
    raise exception 'Invalid close price';
  end if;

  -- Lock the profile row; bail if already blown.
  select * into v_profile
    from public.profiles
   where id = p_user_id
     and account_status = 'ACTIVE'
   for update;
  if not found then
    return false;
  end if;

  -- Lock the open trades and recompute unrealized P&L at the given price.
  select coalesce(sum(
           case side
             when 'BUY'  then p_close_price - entry_price
             when 'SELL' then entry_price - p_close_price
           end), 0)
    into v_unrealized_pnl
    from public.trades
   where user_id = p_user_id
     and status = 'OPEN'
     for update;

  -- Re-check the breach: equity must be <= 95% of the daily start.
  if v_profile.balance + v_unrealized_pnl
       > v_profile.daily_starting_balance * 0.95 then
    return false;
  end if;

  -- Close every open trade at the live price (compute_trade_pnl sets pnl,
  -- trades_apply_pnl settles it into the balance), then blow the account.
  update public.trades
     set status = 'CLOSED',
         close_price = p_close_price
   where user_id = p_user_id
     and status = 'OPEN';

  update public.profiles
     set account_status = 'BLOWN',
         updated_at = now()
   where id = p_user_id;

  return true;
end;
$$;

-- Only the service role may call it. Functions are executable by PUBLIC by
-- default, so revoke from PUBLIC explicitly — not just anon/authenticated.
revoke execute on function public.liquidate_account(uuid, numeric) from public, anon, authenticated;
grant execute on function public.liquidate_account(uuid, numeric) to service_role;

-- ── 4. Daily starting-balance snapshot (00:00 UTC) ───────────────────
create or replace function public.snapshot_daily_balances()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set daily_starting_balance = balance,
         updated_at = now();
end;
$$;

-- ── 5. pg_cron scheduling ─────────────────────────────────────────────
-- Enable the extensions (Dashboard → Database → Extensions also works).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 5a. Snapshot every trader's daily starting balance at midnight UTC.
-- (Unschedule first so re-running this file is idempotent.)
select cron.unschedule('daily-balance-snapshot')
 where exists (select 1 from cron.job where jobname = 'daily-balance-snapshot');
select cron.schedule(
  'daily-balance-snapshot',
  '0 0 * * *',
  $$ select public.snapshot_daily_balances(); $$
);

-- 5b. Run the drawdown monitor every minute via HTTP.
-- REPLACE <PROJECT_REF> with your Supabase project ref and
-- <SERVICE_ROLE_KEY> with the service_role key (Settings → API).
select cron.unschedule('drawdown-monitor-every-minute')
 where exists (select 1 from cron.job where jobname = 'drawdown-monitor-every-minute');
select cron.schedule(
  'drawdown-monitor-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/drawdown-monitor',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect / remove jobs later:
--   select * from cron.job;
--   select cron.unschedule('drawdown-monitor-every-minute');

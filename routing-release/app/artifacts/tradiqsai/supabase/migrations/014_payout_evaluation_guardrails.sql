-- Server-owned payout evaluation: a $10,000 virtual account can only create
-- a limited monthly cashout request after it satisfies the prop-firm rules.
-- Safe to run more than once.
--
-- Threat model that shapes this file:
--   Authenticated users can write their own `trades` rows through PostgREST,
--   including `entry_price` and `close_price`. The existing P&L trigger then
--   settles that client-chosen result into `profiles.balance`. Any payout rule
--   derived from `profiles.balance` is therefore forgeable, and this pays real
--   money. So payouts are computed from a *verified* ledger instead: only
--   trades whose entry AND close price came from a server-side price feed
--   count. Client-written trades still work for the simulator, but they can
--   never create or protect a payout.

-- ── Server-owned market prices ───────────────────────────────────────
-- Written only by the service role (the drawdown-monitor edge function
-- upserts the Coinbase spot price it already fetches every minute).
create table if not exists public.market_prices (
  asset text primary key,
  price numeric not null check (price > 0),
  updated_at timestamptz not null default now()
);

alter table public.market_prices enable row level security;
revoke all on public.market_prices from anon, authenticated;

-- Readable so the app can show the reference price; never writable.
drop policy if exists "market_prices_select_all" on public.market_prices;
create policy "market_prices_select_all"
  on public.market_prices for select to authenticated
  using (true);
grant select on public.market_prices to authenticated;

-- ── Trade price provenance ───────────────────────────────────────────
-- 'SERVER' means both the entry and the close price came from
-- public.market_prices inside the guarded RPCs below. Only these count
-- toward a payout.
alter table if exists public.trades
  add column if not exists price_source text not null default 'CLIENT';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trades_price_source_check'
  ) then
    alter table public.trades
      add constraint trades_price_source_check
      check (price_source in ('CLIENT', 'SERVER'));
  end if;
end;
$$;

create index if not exists trades_user_source_idx
  on public.trades (user_id, price_source, status);

-- Returns the trusted price for an asset, or raises if it is missing or
-- stale. Fails closed: no fresh feed means no verified trade.
create or replace function public.trusted_market_price(p_asset text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_price numeric;
begin
  select price into v_price
    from public.market_prices
   where asset = p_asset
     and updated_at > now() - interval '2 minutes';
  if v_price is null then
    raise exception 'No live server price for % right now.', p_asset
      using errcode = '55000';
  end if;
  return v_price;
end;
$$;

revoke all on function public.trusted_market_price(text) from public, anon;
grant execute on function public.trusted_market_price(text) to authenticated;

-- P&L trigger, extended to stamp price provenance. The RPCs below set a
-- transaction-local flag; a direct PostgREST write cannot set it, because
-- PostgREST only exposes functions in the public schema and runs each
-- request in its own transaction.
create or replace function public.compute_trade_pnl()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trusted boolean := coalesce(current_setting('app.trusted_trade', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.pnl := null;
    new.close_price := null;
    new.closed_at := null;
    new.status := 'OPEN';
    new.price_source := case when trusted then 'SERVER' else 'CLIENT' end;
    return new;
  end if;

  -- UPDATE path
  if old.status = 'CLOSED' then
    raise exception 'Trade is closed and cannot be modified';
  end if;

  -- Entry data is immutable.
  new.user_id := old.user_id;
  new.asset := old.asset;
  new.side := old.side;
  new.entry_price := old.entry_price;
  new.created_at := old.created_at;

  -- Provenance can only be downgraded, never upgraded: a trade opened at a
  -- server price but closed at a client-chosen price is no longer verified,
  -- and a client-opened trade cannot be laundered by closing it via the RPC.
  new.price_source := case
    when old.price_source = 'SERVER' and trusted then 'SERVER'
    else 'CLIENT'
  end;

  if new.status = 'CLOSED' then
    if new.close_price is null then
      raise exception 'close_price is required to close a trade';
    end if;
    new.pnl := case
      when old.side = 'BUY'  then new.close_price - old.entry_price
      when old.side = 'SELL' then old.entry_price - new.close_price
    end;
    new.closed_at := now();
  else
    new.pnl := null;
    new.close_price := null;
    new.closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trades_compute_pnl on public.trades;
create trigger trades_compute_pnl
  before insert or update on public.trades
  for each row
  execute function public.compute_trade_pnl();

-- ── Guarded open/close, priced by the server ─────────────────────────
create or replace function public.open_server_trade(
  p_asset text,
  p_side text,
  p_position_size_usd numeric default 0,
  p_signal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  v_price numeric;
  v_status text;
  v_row public.trades%rowtype;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_side not in ('BUY', 'SELL') then
    raise exception 'Invalid side' using errcode = '22023';
  end if;
  if p_position_size_usd < 0 then
    raise exception 'Invalid position size' using errcode = '22023';
  end if;

  select account_status into v_status from public.profiles where id = caller;
  if v_status = 'BLOWN' then
    raise exception 'Account is blown — trading is disabled.' using errcode = '42501';
  end if;

  v_price := public.trusted_market_price(p_asset);

  perform set_config('app.trusted_trade', 'on', true);
  insert into public.trades (
    user_id, signal_id, asset, side, direction, entry_price,
    position_size_usd, status
  )
  values (
    caller, p_signal_id, p_asset, p_side, p_side, v_price,
    coalesce(p_position_size_usd, 0), 'OPEN'
  )
  returning * into v_row;
  perform set_config('app.trusted_trade', 'off', true);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.close_server_trade(p_trade_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  v_row public.trades%rowtype;
  v_price numeric;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_row
    from public.trades
   where id = p_trade_id and user_id = caller
   for update;
  if not found then
    raise exception 'Trade not found' using errcode = 'P0002';
  end if;
  if v_row.status = 'CLOSED' then
    raise exception 'Trade is already closed' using errcode = '22023';
  end if;

  v_price := public.trusted_market_price(v_row.asset);

  perform set_config('app.trusted_trade', 'on', true);
  update public.trades
     set status = 'CLOSED', close_price = v_price
   where id = p_trade_id
   returning * into v_row;
  perform set_config('app.trusted_trade', 'off', true);

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.open_server_trade(text, text, numeric, uuid) from public, anon;
revoke all on function public.close_server_trade(uuid) from public, anon;
grant execute on function public.open_server_trade(text, text, numeric, uuid) to authenticated;
grant execute on function public.close_server_trade(uuid) to authenticated;

-- Liquidation closes trades with a server-fetched price, so it must keep the
-- verified stamp. Without this the trigger would downgrade liquidated trades
-- to 'CLIENT' and silently drop their (losing) P&L out of the payout ledger.
create or replace function public.liquidate_account(
  p_user_id     uuid,
  p_close_price numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile        public.profiles%rowtype;
  v_unrealized_pnl numeric;
begin
  if p_close_price is null or p_close_price <= 0 then
    raise exception 'Invalid close price';
  end if;

  select * into v_profile
    from public.profiles
   where id = p_user_id
     and account_status = 'ACTIVE'
   for update;
  if not found then
    return false;
  end if;

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

  if v_profile.balance + v_unrealized_pnl
       > v_profile.daily_starting_balance * 0.95 then
    return false;
  end if;

  perform set_config('app.trusted_trade', 'on', true);
  update public.trades
     set status = 'CLOSED',
         close_price = p_close_price
   where user_id = p_user_id
     and status = 'OPEN';
  perform set_config('app.trusted_trade', 'off', true);

  update public.profiles
     set account_status = 'BLOWN',
         updated_at = now()
   where id = p_user_id;

  return true;
end;
$$;

revoke execute on function public.liquidate_account(uuid, numeric) from public, anon, authenticated;
grant execute on function public.liquidate_account(uuid, numeric) to service_role;

-- ── Evaluation cycle + payout request storage ────────────────────────
create table if not exists public.payout_evaluation_cycles (
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_start date not null,
  violated_at timestamptz,
  violation_reason text,
  primary key (user_id, cycle_start),
  check (
    (violated_at is null and violation_reason is null)
    or (violated_at is not null and length(trim(coalesce(violation_reason, ''))) > 0)
  )
);

create table if not exists public.payout_requests (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_start date not null,
  amount numeric not null check (amount > 0),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID')),
  created_at timestamptz not null default now()
);

create index if not exists payout_requests_user_cycle_idx
  on public.payout_requests (user_id, cycle_start);

alter table public.payout_evaluation_cycles enable row level security;
alter table public.payout_requests enable row level security;

revoke all on public.payout_evaluation_cycles from anon, authenticated;
revoke all on public.payout_requests from anon, authenticated;
revoke all on sequence public.payout_requests_id_seq from anon, authenticated;

-- Users may inspect their own historic request records, but cannot create,
-- edit, or delete them outside the guarded RPC below.
drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own"
  on public.payout_requests for select to authenticated
  using (auth.uid() = user_id);
grant select on public.payout_requests to authenticated;

-- Returns a signed-in user's current, authoritative evaluation state. Calling
-- it also latches a drawdown breach for the rest of the monthly cycle.
--
-- Every number below comes from the verified ledger (price_source = 'SERVER')
-- or from server-owned columns. `profiles.balance` is deliberately NOT used:
-- it can be moved by client-written trades.
create or replace function public.payout_evaluation_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  profile_row public.profiles%rowtype;
  cycle date := date_trunc('month', now() at time zone 'UTC')::date;
  day_start timestamptz := (now() at time zone 'UTC')::date::timestamptz;
  effective_tier text;
  plan text;
  split numeric;
  cap numeric;
  verified_pnl numeric;
  daily_pnl numeric;
  daily_loss numeric;
  total_equity numeric;
  active_days integer;
  paid numeric;
  virtual_profit numeric;
  cashout numeric;
  cycle_row public.payout_evaluation_cycles%rowtype;
  reason text;
  eligible boolean;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into profile_row from public.profiles where id = caller for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  -- Realized P&L from verified trades only.
  select coalesce(sum(t.pnl), 0) into verified_pnl
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.status = 'CLOSED'
     and t.pnl is not null;

  select coalesce(sum(t.pnl), 0) into daily_pnl
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.status = 'CLOSED'
     and t.pnl is not null
     and t.closed_at >= day_start;

  total_equity := 10000 + verified_pnl;
  daily_loss := greatest(0, -daily_pnl);

  effective_tier := lower(trim(coalesce(
    profile_row.manual_tier_override,
    profile_row.tier,
    'free'
  )));
  if profile_row.free_trial_until is not null and profile_row.free_trial_until > now() then
    effective_tier := 'pro';
  end if;
  if effective_tier in ('elite', 'whale', 'vip') then
    plan := 'ELITE';
    split := 0.10;
    cap := 500;
  elsif effective_tier = 'pro' then
    plan := 'PRO';
    split := 0.05;
    cap := 250;
  else
    -- A free account receives no payable summary; the client must not infer
    -- eligibility from local subscription state.
    return jsonb_build_object(
      'plan', 'PRO', 'starting_demo_balance', 10000,
      'virtual_profit', 0, 'profit_split', 0.05, 'monthly_cap', 250,
      'monthly_paid', 0, 'cashout_value', 0,
      'daily_loss', round(daily_loss, 2),
      'total_equity', round(total_equity, 2),
      'active_days', 0, 'violated', false,
      'violation_reason', null, 'eligible', false,
      'lock_reason', 'An active Pro or Elite plan is required for payouts.'
    );
  end if;

  -- Latch either hard breach. Once recorded, it remains a violation until the
  -- next billing/evaluation cycle even if an account later appears to recover.
  if profile_row.account_status = 'BLOWN' then
    reason := 'Account violated by the drawdown monitor.';
  elsif daily_loss > 500 then
    reason := 'Daily drawdown limit breached (more than $500 lost in 24 hours).';
  elsif total_equity < 9000 then
    reason := 'Total drawdown limit breached (equity fell below $9,000).';
  end if;

  insert into public.payout_evaluation_cycles (user_id, cycle_start, violated_at, violation_reason)
  values (caller, cycle, case when reason is null then null else now() end, reason)
  on conflict (user_id, cycle_start) do update
    set violated_at = coalesce(public.payout_evaluation_cycles.violated_at, excluded.violated_at),
        violation_reason = coalesce(public.payout_evaluation_cycles.violation_reason, excluded.violation_reason);

  select * into cycle_row
    from public.payout_evaluation_cycles
   where user_id = caller and cycle_start = cycle;

  -- Active days also come from the verified ledger, so fabricated rows cannot
  -- satisfy the six-day requirement.
  select count(distinct (t.created_at at time zone 'UTC')::date)::integer
    into active_days
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.created_at >= cycle::timestamptz;

  select coalesce(sum(r.amount), 0) into paid
    from public.payout_requests r
   where r.user_id = caller
     and r.cycle_start = cycle
     and r.status in ('REQUESTED', 'APPROVED', 'PAID');

  virtual_profit := greatest(0, verified_pnl);
  cashout := least(virtual_profit * split, greatest(0, cap - paid));

  if cycle_row.violated_at is not null then
    reason := cycle_row.violation_reason;
  elsif active_days < 6 then
    reason := format('Trade on %s more separate day%s to qualify.', 6 - active_days, case when 6 - active_days = 1 then '' else 's' end);
  elsif paid >= cap then
    reason := 'Max Monthly Payout Cap reached.';
  elsif cashout <= 0 then
    reason := 'No eligible virtual profit is available to cash out.';
  else
    reason := null;
  end if;
  eligible := reason is null;

  return jsonb_build_object(
    'plan', plan,
    'starting_demo_balance', 10000,
    'virtual_profit', round(virtual_profit, 2),
    'profit_split', split,
    'monthly_cap', cap,
    'monthly_paid', round(paid, 2),
    'cashout_value', round(cashout, 2),
    'daily_loss', round(daily_loss, 2),
    'total_equity', round(total_equity, 2),
    'active_days', active_days,
    'violated', cycle_row.violated_at is not null,
    'violation_reason', cycle_row.violation_reason,
    'eligible', eligible,
    'lock_reason', reason
  );
end;
$$;

-- Creates a reserved payout request only after recomputing every guardrail in
-- the same transaction. The advisory lock prevents simultaneous requests
-- from racing past the monthly cap.
create or replace function public.request_evaluation_payout()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  summary jsonb;
  cycle date := date_trunc('month', now() at time zone 'UTC')::date;
  amount numeric;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext(caller::text));
  summary := public.payout_evaluation_summary();
  if not coalesce((summary ->> 'eligible')::boolean, false) then
    raise exception '%', coalesce(summary ->> 'lock_reason', 'Payout is not eligible.')
      using errcode = '42501';
  end if;
  amount := (summary ->> 'cashout_value')::numeric;
  if amount <= 0 then
    raise exception 'No eligible cashout value.' using errcode = '22023';
  end if;
  insert into public.payout_requests (user_id, cycle_start, amount)
  values (caller, cycle, amount);
  return public.payout_evaluation_summary();
end;
$$;

revoke all on function public.payout_evaluation_summary() from public, anon;
revoke all on function public.request_evaluation_payout() from public, anon;
grant execute on function public.payout_evaluation_summary() to authenticated;
grant execute on function public.request_evaluation_payout() to authenticated;

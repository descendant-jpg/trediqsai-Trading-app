-- Paste this whole file into the Supabase SQL editor and run it once.
-- Bundles the AutoPilot migrations that were never applied to the live project.
-- Every section is written to be safe to run more than once.

-- ============================================================
-- migrations/007_autopilot_profiles.sql
-- ============================================================
alter table if exists public.profiles
  add column if not exists active_bot text,
  add column if not exists allocated_capital numeric;

-- ============================================================
-- migrations/009_profiles_tier_rls.sql
-- ============================================================
-- Lock down the profiles table so paid access cannot be self-granted.
--
-- Before this migration the table was reachable with the anon key: a client
-- could PATCH a row and set `tier` to 'pro', unlocking Pro-only features
-- without paying (verified against the live database). Subscription state is
-- server-owned and must only ever be written by the service role -- billing
-- webhooks and staff tooling -- never by the app.
--
-- Two independent layers are used, so a mistake in one does not reopen the
-- hole:
--   1. RLS restricts which ROWS a user can see and update (their own).
--   2. Column privileges restrict which COLUMNS they may write. RLS has no
--      column scoping, so that part is enforced with GRANT/REVOKE.
--
-- Safe to run more than once.

alter table if exists public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Row-level policies
-- ---------------------------------------------------------------------------

-- Replace older permissive policies that allowed clients to write whole rows.
drop policy if exists "profiles own row" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_safe_columns" on public.profiles;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own_row" on public.profiles;
create policy "profiles_update_own_row"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert or delete policy for clients: rows are created by the signup
-- trigger and removed by account deletion, both of which run server-side.
-- No policies are granted to `anon`, so signed-out callers see nothing.

-- ---------------------------------------------------------------------------
-- Column privileges: which fields a signed-in user may write
-- ---------------------------------------------------------------------------

-- Start from a clean slate for the client-facing roles.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;

-- Signed-in users may read their own row (rows still filtered by RLS).
grant select on public.profiles to authenticated;

-- ...and may write only these user-owned fields. Every column absent from
-- this list -- notably tier, manual_tier_override, free_trial_until, the
-- subscription_* fields, is_admin, is_banned, is_suspended and bankroll -- is
-- server-owned and rejected by Postgres at the privilege layer, before any
-- policy or application code runs.
--
-- The bar for inclusion is "can a forged value buy the user something?".
-- Cosmetic and self-reported fields (display name, push token, simulator
-- balance, gamification rank) stay client-writable; anything that gates a
-- paid feature does not. Removing a column the app legitimately writes just
-- breaks that flow without improving security, so keep this list in step
-- with the client's actual writes.
--
-- Granted dynamically because this schema has drifted across environments:
-- naming a column that does not exist would abort the whole migration and
-- leave the table unprotected. Missing columns are skipped, not fatal.
do $$
declare
  writable text[] := array[
    'username',
    'full_name',
    'avatar_url',
    'user_country',
    'daily_loss_limit',
    'disclaimer_accepted',
    'disclaimer_accepted_at',
    'age_confirmed',
    'updated_at',
    -- Device push token: written by the app after the OS issues one. Not an
    -- entitlement field -- the worst a user can do is misroute their own
    -- notifications.
    'expo_push_token',
    -- Gamification rank ('Bronze'..), derived from the user's own simulated
    -- trading stats and written by the client after a trade. It gates no paid
    -- feature, so a forged value is cosmetic. Distinct from `tier`.
    'rank_tier',
    -- Play-money balance for the trading simulator. Self-reported by design:
    -- it buys nothing and unlocks nothing.
    'simulated_balance'
    -- NOTE: active_bot and allocated_capital are deliberately absent. They
    -- record which strategy the user deployed, and some strategies are
    -- Pro-only -- so a writable active_bot is itself a paid-feature bypass
    -- (a free user could simply write 'Swing Master'). They are written
    -- through the set_active_bot() function in 011, which checks the tier.
  ];
  col text;
begin
  foreach col in array writable loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = col
    ) then
      execute format(
        'grant update (%I) on public.profiles to authenticated',
        col
      );
    end if;
  end loop;
end
$$;

-- The service role bypasses RLS and holds table-level privileges, so billing
-- webhooks, the API server's tier lookups, and admin tooling are unaffected.


-- ============================================================
-- migrations/011_set_active_bot.sql
-- ============================================================
-- Deploying an AutoPilot strategy is an entitlement decision, so it must be
-- made by the database, not the app.
--
-- `profiles.active_bot` names the deployed strategy, and some strategies are
-- Pro-only. That makes the column itself a paid feature: if a client can
-- write it, a free user can simply write 'Swing Master' and skip the
-- paywall -- a UI lock does not stop a replayed PostgREST call.
--
-- 009 therefore withholds UPDATE on active_bot / allocated_capital. This
-- migration provides the only supported way to change them: a security
-- definer function that re-checks the caller's tier server-side, using the
-- same rules as the API server (tier, staff override, unexpired trial).
--
-- Safe to run more than once.

alter table if exists public.profiles
  add column if not exists active_bot text;

alter table if exists public.profiles
  add column if not exists allocated_capital numeric;

-- Strategies that require a paid plan. Kept as a table so the catalogue can
-- change without a code deploy, and so the check cannot drift from a list
-- hardcoded in the client.
create table if not exists public.autopilot_strategies (
  name text primary key,
  requires_pro boolean not null default false
);

insert into public.autopilot_strategies (name, requires_pro) values
  ('Pulse Scalper', false),
  ('Swing Master', true),
  ('News Sniper',  true)
on conflict (name) do update set requires_pro = excluded.requires_pro;

alter table public.autopilot_strategies enable row level security;

-- The catalogue is public information (the UI lists locked bots too).
drop policy if exists "autopilot_strategies_readable" on public.autopilot_strategies;
create policy "autopilot_strategies_readable"
  on public.autopilot_strategies for select
  to authenticated
  using (true);

revoke all on public.autopilot_strategies from anon, authenticated;
grant select on public.autopilot_strategies to authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement predicate (shared by the deploy function)
-- ---------------------------------------------------------------------------

-- Pure predicate over the entitlement fields themselves. Kept separate from
-- the lookup below so it can be evaluated against a row that is being
-- written but is not yet visible to a query (see the downgrade trigger).
create or replace function public.tier_grants_pro(
  tier text,
  manual_tier_override text,
  free_trial_until timestamptz
)
returns boolean
language sql
stable
as $$
  select
    -- An unexpired trial grants Pro regardless of the stored tier.
    (free_trial_until is not null and free_trial_until > now())
    -- A staff override wins over the billing-derived tier.
    or lower(trim(coalesce(manual_tier_override, tier, 'free')))
         in ('pro', 'elite', 'whale', 'vip');
$$;

create or replace function public.user_has_pro_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select public.tier_grants_pro(
        p.tier, p.manual_tier_override, p.free_trial_until
      )
      from public.profiles p
      where p.id = target_user
    ),
    false -- no row -> no access (fail closed)
  );
$$;

-- ---------------------------------------------------------------------------
-- The only supported way for a client to deploy a strategy
-- ---------------------------------------------------------------------------

create or replace function public.set_active_bot(
  bot_name text,
  capital_percent numeric
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  needs_pro boolean;
  updated public.profiles;
begin
  if caller is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  -- Deactivating is always allowed.
  if bot_name is null then
    update public.profiles
       set active_bot = null, allocated_capital = null
     where id = caller
    returning * into updated;
    return updated;
  end if;

  select s.requires_pro into needs_pro
    from public.autopilot_strategies s
   where s.name = bot_name;

  if needs_pro is null then
    raise exception 'Unknown strategy: %', bot_name
      using errcode = '22023';
  end if;

  if needs_pro and not public.user_has_pro_access(caller) then
    raise exception 'This strategy requires an Elite subscription'
      using errcode = '42501';
  end if;

  if capital_percent is null or capital_percent < 10 or capital_percent > 100 then
    raise exception 'Capital allocation must be between 10%% and 100%%'
      using errcode = '22023';
  end if;

  update public.profiles
     set active_bot = bot_name,
         allocated_capital = capital_percent
   where id = caller
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.set_active_bot(text, numeric) from public, anon;
grant execute on function public.set_active_bot(text, numeric) to authenticated;

revoke all on function public.user_has_pro_access(uuid) from public, anon;
grant execute on function public.user_has_pro_access(uuid) to authenticated;

revoke all on function public.tier_grants_pro(text, text, timestamptz) from public, anon;
grant execute on function public.tier_grants_pro(text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement loss must stop a running Pro strategy
-- ---------------------------------------------------------------------------

-- A user who deployed a Pro strategy and then downgraded would otherwise
-- keep it running: the deploy check only runs at deploy time. Clearing the
-- deployment when entitlement goes away closes that window at the source,
-- so it holds no matter which code path performs the downgrade.
create or replace function public.clear_active_bot_on_downgrade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Evaluate the row being written, not the stored one: in a BEFORE UPDATE
  -- the table still holds the pre-downgrade tier, so re-querying it would
  -- report the user as entitled and the revocation would never fire.
  if new.active_bot is not null
     and coalesce((
       select s.requires_pro
         from public.autopilot_strategies s
        where s.name = new.active_bot
     ), false)
     and not public.tier_grants_pro(
       new.tier, new.manual_tier_override, new.free_trial_until
     )
  then
    new.active_bot := null;
    new.allocated_capital := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_active_bot_on_downgrade on public.profiles;
create trigger profiles_clear_active_bot_on_downgrade
  before update on public.profiles
  for each row
  execute function public.clear_active_bot_on_downgrade();


-- ============================================================
-- migrations/013_strategy_brief_cache.sql
-- ============================================================
-- Cache one-line Anthropic strategy briefs in Supabase. The cache is strictly
-- server-owned: clients never query or write it, because it is operational
-- data and exposing it would invite cache poisoning and prompt-cost abuse.
--
-- The API looks up a matching bot/allocation written in the previous 15
-- minutes. Keeping allocation in the cache key prevents an old 10% brief
-- from being presented as analysis for a 100% allocation.
--
-- Safe to run more than once.

create table if not exists public.autopilot_strategy_brief_cache (
  id bigint generated by default as identity primary key,
  bot_name text not null,
  capital_percent numeric not null check (capital_percent between 10 and 100),
  brief text not null check (length(trim(brief)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists autopilot_strategy_brief_cache_lookup_idx
  on public.autopilot_strategy_brief_cache (
    bot_name,
    capital_percent,
    created_at desc
  );

alter table public.autopilot_strategy_brief_cache enable row level security;

-- Explicitly deny app roles. The Supabase service role bypasses RLS and is
-- the only identity the API server uses to operate this cache.
revoke all on public.autopilot_strategy_brief_cache from anon, authenticated;
revoke all on sequence public.autopilot_strategy_brief_cache_id_seq
  from anon, authenticated;

-- A read-only schema probe for the API's startup/mobile readiness check.
-- Calling set_active_bot with a null strategy would deactivate a real bot, so
-- the health check must inspect its presence rather than invoking it.
create or replace function public.autopilot_dependencies_ready()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'set_active_bot',
      to_regprocedure('public.set_active_bot(text,numeric)') is not null,
    'autopilot_strategies',
      to_regclass('public.autopilot_strategies') is not null,
    'profile_bot_columns',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = 'active_bot'
      ) and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = 'allocated_capital'
      )
  );
$$;

revoke all on function public.autopilot_dependencies_ready() from public, anon, authenticated;


-- ============================================================
-- migrations/012_retire_tier_level.sql
-- ============================================================
-- Retire profiles.tier_level in favour of the canonical profiles.tier, and
-- restore a safe profile-creation path.
--
-- Two entitlement columns on one table is a security problem, not just
-- untidiness: 009 locks down `tier`, but a deployment provisioned from
-- schema.sql also has `tier_level` (the column the admin UI and the older
-- profile model use). Any column left out of the explicit GRANT list is
-- server-owned by default, so `tier_level` is not directly writable -- but
-- keeping a second, parallel entitlement field invites a future grant or a
-- code path that trusts it, and reopens the bypass. One column is the
-- contract; this migration makes that true.
--
-- Note: profiles.tier_level is distinct from affiliates.tier_level, which is
-- a partner rank ('Ambassador'/'Elite'/'Master'), not a paid entitlement.
-- That column is intentionally left alone.
--
-- Safe to run more than once.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'tier_level'
  ) then
    -- Carry values across before dropping. schema.sql stores capitalised
    -- values ('Free','Pro','Elite','Whale'); `tier` is lowercase.
    update public.profiles
       set tier = lower(trim(tier_level))
     where tier_level is not null
       and lower(trim(tier_level)) <> 'free'
       and coalesce(tier, 'free') = 'free';

    alter table public.profiles drop column tier_level;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Profile creation
-- ---------------------------------------------------------------------------

-- 009 removed the blanket client INSERT policy (it let a client create a row
-- with any column values, including a paid tier). Rows are instead created
-- by this trigger as the database owner, which cannot be influenced by the
-- client: a new profile always starts on the free tier regardless of
-- anything supplied at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, username, tier)
  values (
    new.id,
    new.email,
    -- Prefer a supplied display name, else the email local part.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'trader'), '@', 1)
    ),
    'free' -- never trust signup metadata for entitlement
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill any auth user that predates the trigger, so existing accounts are
-- not left without a profile row now that clients cannot insert one.
insert into public.profiles (id, email, username, tier)
select
  u.id,
  u.email,
  split_part(coalesce(u.email, 'trader'), '@', 1),
  'free'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;


-- ============================================================
-- migrations/014_payout_evaluation_guardrails.sql
-- ============================================================
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

-- ============================================================
-- migrations/024_reject_anonymous_payout_access.sql
-- ============================================================
create or replace function public.is_anonymous_auth_user()
returns boolean language sql stable as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb
      ->> 'is_anonymous')::boolean, false
  );
$$;

do $$
begin
  if to_regprocedure('public.payout_evaluation_summary_unchecked()') is null
     and to_regprocedure('public.payout_evaluation_summary()') is not null then
    alter function public.payout_evaluation_summary() rename to payout_evaluation_summary_unchecked;
  end if;
  if to_regprocedure('public.request_evaluation_payout_unchecked()') is null
     and to_regprocedure('public.request_evaluation_payout()') is not null then
    alter function public.request_evaluation_payout() rename to request_evaluation_payout_unchecked;
  end if;
end;
$$;

create or replace function public.payout_evaluation_summary()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_anonymous_auth_user() then
    raise exception 'Create an account to access payout evaluation.' using errcode = '42501';
  end if;
  return public.payout_evaluation_summary_unchecked();
end;
$$;

create or replace function public.request_evaluation_payout()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_anonymous_auth_user() then
    raise exception 'Create an account to request a payout.' using errcode = '42501';
  end if;
  return public.request_evaluation_payout_unchecked();
end;
$$;

revoke all on function public.payout_evaluation_summary_unchecked() from public, anon, authenticated;
revoke all on function public.request_evaluation_payout_unchecked() from public, anon, authenticated;
revoke all on function public.payout_evaluation_summary() from public, anon;
revoke all on function public.request_evaluation_payout() from public, anon;
grant execute on function public.payout_evaluation_summary() to authenticated;
grant execute on function public.request_evaluation_payout() to authenticated;

drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own"
  on public.payout_requests for select to authenticated
  using (auth.uid() = user_id and not public.is_anonymous_auth_user());

-- ============================================================
-- migrations/022_revenuecat_tier.sql
-- ============================================================
-- RevenueCat's verified entitlement is separate from `tier`, which is also
-- managed by Stripe and staff tools. Only verified webhooks may write it.
alter table if exists public.profiles
  add column if not exists revenuecat_tier text not null default 'starter';

alter table if exists public.profiles
  drop constraint if exists profiles_revenuecat_tier_check;

alter table if exists public.profiles
  add constraint profiles_revenuecat_tier_check
  check (revenuecat_tier in ('starter', 'pro', 'elite'));

comment on column public.profiles.revenuecat_tier is
  'Server-owned RevenueCat entitlement tier. Updated only by verified RevenueCat webhooks.';

revoke update (revenuecat_tier) on public.profiles from authenticated;

-- ============================================================
-- migrations/023_revenuecat_webhook_ordering.sql
-- ============================================================
-- RevenueCat retries webhooks and does not guarantee delivery order. The RPC
-- accepts only newer events so a delayed purchase cannot restore an expired
-- or transferred entitlement.
alter table if exists public.profiles
  add column if not exists revenuecat_last_event_at timestamptz;

comment on column public.profiles.revenuecat_last_event_at is
  'Timestamp of the newest verified RevenueCat webhook applied to this profile.';

create or replace function public.apply_revenuecat_entitlement(
  p_user_id uuid,
  p_tier text,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_rows integer := 0;
begin
  if p_tier not in ('starter', 'pro', 'elite') then
    raise exception 'invalid RevenueCat tier';
  end if;

  update public.profiles
     set revenuecat_tier = p_tier,
         revenuecat_last_event_at = p_event_at
   where id = p_user_id
     and (revenuecat_last_event_at is null or revenuecat_last_event_at < p_event_at);

  get diagnostics updated_rows = row_count;
  return updated_rows > 0;
end;
$$;

revoke all on function public.apply_revenuecat_entitlement(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement(uuid, text, timestamptz)
  to service_role;

-- ============================================================
-- migrations/017_admin_roles.sql
-- ============================================================
-- Administrative authority is server-owned. Authenticated clients receive no
-- UPDATE privilege for this column through the profiles RLS migration.
alter table if exists public.profiles
  add column if not exists role text not null default 'user';

-- Keep the stored values explicit so authorization checks cannot encounter
-- arbitrary role strings.
alter table if exists public.profiles
  drop constraint if exists profiles_role_check;

alter table if exists public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin'));

-- ============================================================
-- migrations/016_market_news.sql
-- ============================================================
-- Server-curated financial news for the in-app Notifications reader.
-- Safe to run more than once.
create table if not exists public.market_news (
  id bigint generated by default as identity primary key,
  external_id text not null unique,
  headline text not null check (length(trim(headline)) > 0),
  ai_summary text not null check (length(trim(ai_summary)) > 0),
  category text not null check (category in ('crypto', 'forex', 'stocks')),
  sentiment text not null check (sentiment in ('Bullish', 'Bearish', 'Neutral')),
  url text not null check (url ~* '^https?://'),
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists market_news_published_at_idx on public.market_news (published_at desc);
alter table public.market_news enable row level security;
revoke all on public.market_news from anon, authenticated;
revoke all on sequence public.market_news_id_seq from anon, authenticated;
drop policy if exists "market_news_readable" on public.market_news;
create policy "market_news_readable" on public.market_news for select to authenticated using (true);
grant select on public.market_news to authenticated;


-- ============================================================
-- migrations/015_payout_settlement_and_reservation.sql
-- ============================================================
-- Forward fix for the payout evaluation guardrails introduced in 014.
--
-- 014 is already applied to live projects, so a database that recorded it will
-- never rerun it. These two defects must therefore ship as their own
-- migration:
--
--   1. Active-day farming. 014 credited an evaluation day for any verified
--      trade ROW created that day, so a trader could open six microscopic
--      positions on six days, never close them, take no real risk, and satisfy
--      the six-day requirement. A day now counts only when a verified trade is
--      CLOSED, and the calendar day comes from the server-set closed_at
--      settlement timestamp rather than created_at.
--
--   2. Repeat reservation of the same profit. 014 computed
--      least(earned, cap - paid), which only subtracts prior reservations from
--      the CAP. With $2,000 profit on Pro (earning $100) a trader could request
--      $100, then request the same $100 again, repeating until the $250 cap was
--      drained without ever earning more. The amount is now
--      greatest(0, least(earned, cap) - paid): reservations are subtracted from
--      the capped EARNED entitlement, so new payable value appears only after
--      new verified profit.
--
-- Everything else from 014 (verified price provenance, RLS, grants, the
-- payout tables) is unchanged and is not repeated here.
--
-- Safe to run more than once.

-- Older live projects created `trades` before settlement timestamps were
-- introduced. Add the column before the corrected index and function below
-- reference it, so the bundle can upgrade those projects in one run.
alter table if exists public.trades
  add column if not exists closed_at timestamptz;

-- An index matched to the corrected active-day predicate.
create index if not exists trades_verified_settled_days_idx
  on public.trades (user_id, closed_at)
  where price_source = 'SERVER'
    and status = 'CLOSED'
    and closed_at is not null;

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
   where user_id = caller and cycle_start = cycle
   for update;

  -- The cycle row is locked above before any eligibility or payout-cap
  -- calculation. The request RPC also locks every existing reservation row
  -- before calling this summary, so the monthly total is stable for the
  -- entire read/validate/insert transaction.

  -- An active day is credited only when a verified trade settles. Open trades
  -- (including tiny, never-closed positions) do not count, and the calendar
  -- day comes from the server-set closed_at timestamp rather than client-
  -- supplied created_at.
  select count(distinct (t.closed_at at time zone 'UTC')::date)::integer
    into active_days
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.status = 'CLOSED'
     and t.closed_at is not null
     and t.closed_at >= cycle::timestamptz;

  select coalesce(sum(r.amount), 0) into paid
    from public.payout_requests r
   where r.user_id = caller
     and r.cycle_start = cycle
     and r.status in ('REQUESTED', 'APPROVED', 'PAID');

  virtual_profit := greatest(0, verified_pnl);
  -- A reservation spends earned entitlement as well as cap room. The old
  -- min(profit split, cap - paid) shape allowed a trader to reserve the same
  -- $100 profit repeatedly until the $250/$500 cap. Subtracting paid from the
  -- capped earned entitlement means a rapid duplicate sees $0 after the first
  -- transaction commits; new cashout value appears only after new profit.
  cashout := greatest(0, least(virtual_profit * split, cap) - paid);

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
  -- This transaction-scoped lock serializes *all* payout attempts for one
  -- user, including the zero-row case where a row-level lock has nothing to
  -- lock yet. Hash collisions can only serialize unrelated users; they never
  -- let a request bypass the check.
  perform pg_advisory_xact_lock(hashtext(caller::text));
  -- Lock existing reservations as an additional protection if administrative
  -- status changes or other server workflows inspect this cycle concurrently.
  perform 1
    from public.payout_requests
   where user_id = caller
     and cycle_start = cycle
   for update;
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

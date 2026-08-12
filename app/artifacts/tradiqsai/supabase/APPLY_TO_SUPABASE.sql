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



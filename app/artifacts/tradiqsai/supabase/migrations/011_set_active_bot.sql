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

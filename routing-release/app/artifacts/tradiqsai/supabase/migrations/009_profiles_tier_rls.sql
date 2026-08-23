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

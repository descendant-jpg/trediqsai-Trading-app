-- Canonical entitlement columns on public.profiles.
--
-- These three columns are the contract the server reads to decide whether a
-- user may use paid features (see the API server's entitlement helper):
--
--   tier                  billing-derived tier: free | pro | elite | whale | vip
--   manual_tier_override  staff-set tier that wins over `tier` (comps, support)
--   free_trial_until      unexpired timestamp grants Pro regardless of `tier`
--
-- They already exist in the hosted database but were never represented in
-- this repo, so a fresh environment created from these migrations came up
-- missing them and every Pro check failed closed. This migration closes that
-- gap and makes the repo reproduce the real schema.
--
-- Supersedes 008_subscription_tier.sql, which introduced a differently-named
-- `subscription_tier` column that nothing reads. Where 008 was applied, its
-- value is carried over below so no paid user is downgraded.
--
-- All columns are server-owned: 009 deliberately withholds UPDATE privileges
-- on them from `authenticated`, so only the service role can write them.
-- Safe to run more than once.

alter table if exists public.profiles
  add column if not exists tier text not null default 'free';

alter table if exists public.profiles
  add column if not exists manual_tier_override text;

alter table if exists public.profiles
  add column if not exists free_trial_until timestamptz;

-- Carry over any tier set by the superseded 008 column, then retire it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'subscription_tier'
  ) then
    update public.profiles
       set tier = subscription_tier
     where subscription_tier is not null
       and subscription_tier <> ''
       and coalesce(tier, 'free') = 'free';

    alter table public.profiles drop column subscription_tier;
  end if;
end
$$;

-- Normalise casing so comparisons are predictable ('Pro' -> 'pro').
update public.profiles
   set tier = lower(trim(tier))
 where tier is not null
   and tier <> lower(trim(tier));

comment on column public.profiles.tier is
  'Server-owned billing tier. Never writable by the client -- see 009.';
comment on column public.profiles.manual_tier_override is
  'Server-owned staff override; takes precedence over tier.';
comment on column public.profiles.free_trial_until is
  'Server-owned trial expiry; grants Pro access while in the future.';

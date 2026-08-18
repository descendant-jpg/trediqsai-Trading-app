-- RevenueCat's verified entitlement is kept separate from `tier`, which is
-- also written by the existing Stripe flow and administrative tooling. The
-- effective entitlement resolver combines the two server-owned sources.
alter table if exists public.profiles
  add column if not exists revenuecat_tier text not null default 'starter';

alter table if exists public.profiles
  drop constraint if exists profiles_revenuecat_tier_check;

alter table if exists public.profiles
  add constraint profiles_revenuecat_tier_check
  check (revenuecat_tier in ('starter', 'pro', 'elite'));

comment on column public.profiles.revenuecat_tier is
  'Server-owned RevenueCat entitlement tier. Updated only by verified RevenueCat webhooks.';

-- 009 grants UPDATE only on an explicit allow-list. This explicit revoke makes
-- the server-only boundary durable even if a database previously had a broad
-- grant.
revoke update (revenuecat_tier) on public.profiles from authenticated;
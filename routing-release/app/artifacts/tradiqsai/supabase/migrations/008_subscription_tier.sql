alter table if exists public.profiles
  add column if not exists subscription_tier text not null default 'free';
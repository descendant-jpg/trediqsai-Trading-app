-- Server-owned Oracle daily message accounting. Client roles must never write
-- these values; the API uses the service role after a successful AI response.
alter table public.profiles
  add column if not exists oracle_daily_usage integer not null default 0,
  add column if not exists oracle_last_reset timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_oracle_daily_usage_nonnegative;
alter table public.profiles
  add constraint profiles_oracle_daily_usage_nonnegative
  check (oracle_daily_usage >= 0);
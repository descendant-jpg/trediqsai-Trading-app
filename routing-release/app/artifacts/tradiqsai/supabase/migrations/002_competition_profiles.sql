alter table if exists public.profiles
  add column if not exists simulated_pnl numeric not null default 0,
  add column if not exists win_rate numeric not null default 0,
  add column if not exists rank_tier text not null default 'Bronze';

create index if not exists profiles_simulated_pnl_idx
  on public.profiles (simulated_pnl desc);
-- User-owned paper-trading bot records and AI-generated trade signals.
-- Apply manually in the Supabase SQL editor (see replit.md).

create table if not exists public.trading_bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair text not null check (length(trim(pair)) between 3 and 20),
  strategy text not null check (strategy in ('GRID', 'DCA')),
  capital numeric not null check (capital > 0),
  status text not null default 'paused' check (status in ('active', 'paused')),
  pnl numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists trading_bots_user_created_idx
  on public.trading_bots (user_id, created_at desc);

alter table public.trading_bots enable row level security;
revoke all on public.trading_bots from anon;
grant select, insert, update on public.trading_bots to authenticated;

drop policy if exists "traders_manage_own_bots" on public.trading_bots;
create policy "traders_manage_own_bots"
  on public.trading_bots for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.trading_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text not null check (length(trim(asset)) between 2 and 20),
  direction text not null check (direction in ('BUY', 'SELL')),
  entry_price numeric not null check (entry_price > 0),
  take_profit numeric not null check (take_profit > 0),
  stop_loss numeric not null check (stop_loss > 0),
  confidence numeric not null check (confidence between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists trading_signals_user_created_idx
  on public.trading_signals (user_id, created_at desc);

alter table public.trading_signals enable row level security;
revoke all on public.trading_signals from anon;
grant select on public.trading_signals to authenticated;

drop policy if exists "traders_read_own_signals" on public.trading_signals;
create policy "traders_read_own_signals"
  on public.trading_signals for select to authenticated
  using (user_id = auth.uid());
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  simulated_balance numeric(14,2) not null default 100000.00,
  tier_level text not null default 'Free' check (tier_level in ('Free','Pro','Elite','Whale')),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_signals (
  id uuid primary key default gen_random_uuid(),
  asset text not null check (asset in ('BTC/USD','USOIL','EUR/USD','NVDA')),
  entry_price numeric(18,6) not null,
  take_profit numeric(18,6) not null,
  stop_loss numeric(18,6) not null,
  direction text not null default 'BUY' check (direction in ('BUY','SELL')),
  rationale text,
  is_vip_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.simulated_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text not null,
  order_type text not null,
  side text not null default 'LONG' check (side in ('LONG','SHORT')),
  leverage integer not null default 1 check (leverage between 1 and 100),
  entry_price numeric(18,6) not null,
  unrealized_pnl numeric(14,2) not null default 0,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.affiliates (
  partner_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text unique,
  total_earnings numeric(14,2) not null default 0,
  tier_level text not null default 'Ambassador' check (tier_level in ('Ambassador','Elite','Master')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.simulated_trades enable row level security;
alter table public.affiliates enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "trades own rows" on public.simulated_trades;
create policy "trades own rows" on public.simulated_trades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "affiliates own row" on public.affiliates;
create policy "affiliates own row" on public.affiliates for all using (auth.uid() = partner_id) with check (auth.uid() = partner_id);
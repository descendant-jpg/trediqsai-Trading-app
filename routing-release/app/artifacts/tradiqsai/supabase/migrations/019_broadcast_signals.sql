create table if not exists public.broadcast_signals (
  id uuid primary key default gen_random_uuid(),
  asset text not null check (length(trim(asset)) between 2 and 20),
  direction text not null check (direction in ('BUY', 'SELL')),
  entry numeric not null check (entry > 0),
  take_profit numeric not null check (take_profit > 0),
  stop_loss numeric not null check (stop_loss > 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'won', 'lost')),
  is_premium boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists broadcast_signals_created_idx on public.broadcast_signals (created_at desc);
alter table public.broadcast_signals enable row level security;
grant select on public.broadcast_signals to anon, authenticated;
revoke insert, update, delete on public.broadcast_signals from anon, authenticated;
drop policy if exists "broadcast_signals_readable" on public.broadcast_signals;
create policy "broadcast_signals_readable" on public.broadcast_signals for select using (true);
drop policy if exists "admins_manage_broadcast_signals" on public.broadcast_signals;
create policy "admins_manage_broadcast_signals" on public.broadcast_signals for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
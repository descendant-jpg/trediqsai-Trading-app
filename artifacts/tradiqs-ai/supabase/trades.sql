-- TradiQs AI — trades table, RLS policies, and secure P&L trigger.
-- Run this in the Supabase SQL editor (or via supabase db push).

-- ── Table ────────────────────────────────────────────────────────────
create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  asset       text not null,
  side        text not null check (side in ('BUY', 'SELL')),
  entry_price numeric not null check (entry_price > 0),
  close_price numeric check (close_price > 0),
  status      text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  pnl         numeric,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create index if not exists trades_user_id_idx on public.trades (user_id);

-- ── Row Level Security ───────────────────────────────────────────────
alter table public.trades enable row level security;

-- Users can only see their own trades.
drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
  on public.trades for select
  using (auth.uid() = user_id);

-- Users can only insert trades for themselves.
drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own"
  on public.trades for insert
  with check (auth.uid() = user_id);

-- Users can only update their own trades.
drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own"
  on public.trades for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: trades are immutable history once written.

-- ── Secure P&L trigger ───────────────────────────────────────────────
-- P&L is computed server-side when a trade is closed. Any client-supplied
-- pnl value is overwritten, so results cannot be manipulated. The trigger
-- also locks down closed trades (no reopening, no edits after close) and
-- prevents tampering with entry data on update.
create or replace function public.compute_trade_pnl()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Clients never set pnl or close data on open.
    new.pnl := null;
    new.close_price := null;
    new.closed_at := null;
    new.status := 'OPEN';
    return new;
  end if;

  -- UPDATE path
  if old.status = 'CLOSED' then
    raise exception 'Trade is closed and cannot be modified';
  end if;

  -- Entry data is immutable.
  new.user_id := old.user_id;
  new.asset := old.asset;
  new.side := old.side;
  new.entry_price := old.entry_price;
  new.created_at := old.created_at;

  if new.status = 'CLOSED' then
    if new.close_price is null then
      raise exception 'close_price is required to close a trade';
    end if;
    new.pnl := case
      when old.side = 'BUY'  then new.close_price - old.entry_price
      when old.side = 'SELL' then old.entry_price - new.close_price
    end;
    new.closed_at := now();
  else
    -- Still open: pnl/close data stay unset regardless of client input.
    new.pnl := null;
    new.close_price := null;
    new.closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trades_compute_pnl on public.trades;
create trigger trades_compute_pnl
  before insert or update on public.trades
  for each row
  execute function public.compute_trade_pnl();

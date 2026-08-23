-- Ensure the portfolio analytics fields exist on existing installations.
-- Safe to run more than once.
alter table if exists public.trades
  add column if not exists pnl numeric not null default 0,
  add column if not exists status text not null default 'open',
  add column if not exists entry_price numeric,
  add column if not exists close_price numeric;

update public.trades
set status = case upper(coalesce(status, 'OPEN'))
  when 'CLOSED' then 'CLOSED'
  else 'OPEN'
end;

alter table if exists public.trades
  drop constraint if exists trades_status_check;

alter table if exists public.trades
  add constraint trades_status_check
  check (status in ('open', 'closed', 'OPEN', 'CLOSED'));

create index if not exists trades_status_idx on public.trades (user_id, status);
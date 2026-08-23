alter table if exists public.trades
  add column if not exists signal_id uuid references public.ai_signals(id),
  add column if not exists direction text,
  add column if not exists take_profit numeric,
  add column if not exists stop_loss numeric,
  add column if not exists position_size_usd numeric,
  alter column status set default 'open';

alter table if exists public.trades
  drop constraint if exists trades_status_execution_check;

alter table if exists public.trades
  add constraint trades_status_execution_check
  check (lower(status) in ('open', 'closed'));

create index if not exists trades_signal_id_idx on public.trades(signal_id);
alter table if exists public.profiles
  add column if not exists active_bot text,
  add column if not exists allocated_capital numeric;
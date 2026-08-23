alter table if exists public.ai_signals
  add column if not exists confluence_factors jsonb not null default '[]'::jsonb;

alter table if exists public.ai_signals
  drop constraint if exists ai_signals_confluence_factors_array;

alter table if exists public.ai_signals
  add constraint ai_signals_confluence_factors_array
  check (jsonb_typeof(confluence_factors) = 'array');
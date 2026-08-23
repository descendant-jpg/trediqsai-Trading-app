alter table public.profiles
  add column if not exists trading_experience text,
  add column if not exists has_completed_onboarding boolean not null default false;

grant update (trading_experience, has_completed_onboarding)
  on public.profiles to authenticated;
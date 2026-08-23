-- Administrative authority is server-owned. Authenticated clients receive no
-- UPDATE privilege for this column through the profiles RLS migration.
alter table if exists public.profiles
  add column if not exists role text not null default 'user';

-- Keep the stored values explicit so authorization checks cannot encounter
-- arbitrary role strings.
alter table if exists public.profiles
  drop constraint if exists profiles_role_check;

alter table if exists public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin'));
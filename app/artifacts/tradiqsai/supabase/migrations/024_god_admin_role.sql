-- Forward-only role upgrade for the mobile administration surface.
-- This does not elevate any account; it only allows an operator to assign the
-- exact god_admin value through trusted server-side/Supabase tooling.
alter table if exists public.profiles
  drop constraint if exists profiles_role_check;

alter table if exists public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'god_admin'));

-- The role column remains server-owned. Authenticated clients retain only the
-- column-scoped profile UPDATE grants established by the earlier RLS migration.
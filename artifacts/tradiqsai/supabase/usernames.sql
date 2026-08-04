-- TradiQs AI — username support for auth.
-- Run AFTER drawdown.sql in the Supabase SQL editor.

-- ── 1. Username + email columns on profiles ──────────────────────────
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email text;

-- Case-insensitive uniqueness for usernames.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- ── 2. Populate from signup metadata ─────────────────────────────────
-- handle_new_user now copies the username (from signUp options.data)
-- and email into the profile row, so the client never needs INSERT
-- rights on profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    new.email
  )
  on conflict (id) do update
    set username = coalesce(public.profiles.username, excluded.username),
        email    = excluded.email;
  return new;
end;
$$;

-- ── 3. Username → email lookup for sign-in ───────────────────────────
-- SECURITY DEFINER RPC instead of an open SELECT policy: an anon-readable
-- profiles table would leak every user's email address. This returns one
-- email only for an exact username match.
create or replace function public.get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email
    from public.profiles
   where lower(username) = lower(trim(p_username))
   limit 1;
$$;

revoke execute on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- ── 4. Username availability check for signup (optional, same pattern) ──
create or replace function public.is_username_taken(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
     where lower(username) = lower(trim(p_username))
  );
$$;

revoke execute on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated;
